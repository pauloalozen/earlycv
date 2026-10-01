import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { EmailDispatchKind } from "@prisma/client";

import { trackJob } from "../common/memory-diagnostics";
import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { EmailDispatchConfigService } from "./email-dispatch.config";
import {
  FEEDBACK_MIN_GAP_AFTER_WELCOME_MS,
  MAX_SEND_ATTEMPTS,
  RETRY_BACKOFF_MS,
  STALE_PROCESSING_THRESHOLD_MS,
  WORKER_BATCH_SIZE,
} from "./email-dispatch.constants";
import { EmailDispatchService } from "./email-dispatch.service";
import { EmailDispatchEligibilityService } from "./email-dispatch-eligibility.service";
import { adjustToFeedbackWindow } from "./email-dispatch-schedule.util";
import type { PurchaseConfirmationPayload } from "./email-dispatch-templates";

const LOCK_ID = "email-dispatch-worker";
const LOCK_TTL_MS = 5 * 60_000;
const BASE_TICK_CRON = "*/30 * * * * *";
const WELCOME_RETRY_DEFER_MS = 60 * 60_000;

type DispatchRow = {
  id: string;
  kind: EmailDispatchKind;
  userId: string | null;
  recipientEmail: string;
  scheduledFor: Date;
  expiresAt: Date;
  attempts: number;
  referenceId: string | null;
  payloadJson: unknown;
};

// Envia as EmailDispatch (boas-vindas e feedback) — mesmo esqueleto do
// ProductUpdateSenderWorker (lock, recuperação de PROCESSING travada,
// OUTCOME_UNKNOWN nunca reenviado), com três diferenças deliberadas:
//  1. CLAIM ATÔMICO por linha (updateMany ... WHERE status=PENDING): o lock
//     do worker protege o lote, o claim protege cada linha mesmo se o lock
//     expirar no meio.
//  2. Erro inesperado ANTES de chamar o provider volta para PENDING (nada
//     foi enviado); só erro DURANTE/DEPOIS vira OUTCOME_UNKNOWN.
//  3. Toda linha tem expiresAt: PENDING além do prazo vira CANCELLED —
//     nada fica pendente indefinidamente.
@Injectable()
export class EmailDispatchWorker implements OnModuleInit {
  private readonly logger = new Logger(EmailDispatchWorker.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
    @Inject(EmailDispatchConfigService)
    private readonly config: EmailDispatchConfigService,
    @Inject(EmailDispatchEligibilityService)
    private readonly eligibility: EmailDispatchEligibilityService,
    @Inject(EmailDispatchService)
    private readonly dispatchService: EmailDispatchService,
  ) {}

  // Estado de ativação visível no log de CADA deploy (sem segredos): modos,
  // cutoff e se o transporte é real ou fake. É o primeiro lugar a olhar para
  // confirmar "tudo OFF" depois de publicar.
  async onModuleInit() {
    const startAt = await this.config.getStartAt();
    this.logger.log(
      `email_dispatch_boot welcome=${await this.config.getEffectiveMode("WELCOME")} feedback=${await this.config.getEffectiveMode("FEEDBACK_FIRST_USE")} purchase=${await this.config.getEffectiveMode("PURCHASE_CONFIRMATION")} startAt=${startAt ? startAt.toISOString() : "unset"} transport=${this.config.isRealTransportAllowed() ? "real" : "fake"}`,
    );

    // Modo ligado + transporte real + infra incompleta = nada seria enviado.
    if (this.config.isRealTransportAllowed()) {
      for (const kind of await this.config.getEnabledKinds()) {
        const readiness =
          kind === "PURCHASE_CONFIRMATION"
            ? this.config.checkPurchaseSendReadiness()
            : this.config.checkSendReadiness();
        if (!readiness.ready) {
          this.logger.warn(
            `email_dispatch_not_ready kind=${kind} reason=${readiness.reason}`,
          );
        }
      }
    }
  }

  @Cron(BASE_TICK_CRON)
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    await trackJob("email-dispatch-worker", () => this.processBatch());
  }

  // Gate em profundidade: com os dois tipos OFF (padrão) este método não
  // toca no banco nem no lock — chamado direto ou via tick().
  async processBatch(now: Date = new Date()): Promise<number> {
    if ((await this.config.getEnabledKinds()).length === 0) {
      return 0;
    }

    const owner = `email-dispatch-worker-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );
    if (!acquired) {
      return 0;
    }

    try {
      await this.recoverStaleProcessing(now);
      await this.expireOverdue(now);

      // Tipos em ALLOWLIST/LIVE só rodam com a infra de envio completa
      // QUANDO o transporte é real; SHADOW nunca envia e o transporte fake
      // (fora de produção) não precisa de infra — rodam sempre.
      const kinds: EmailDispatchKind[] = [];
      for (const kind of await this.config.getEnabledKinds()) {
        if (
          (await this.config.getEffectiveMode(kind)) === "SHADOW" ||
          this.isKindReady(kind)
        ) {
          kinds.push(kind);
        }
      }
      if (kinds.length === 0) {
        return 0;
      }

      const due = await this.database.emailDispatch.findMany({
        where: {
          status: "PENDING",
          scheduledFor: { lte: now },
          kind: { in: kinds },
        },
        orderBy: [{ scheduledFor: "asc" }],
        take: WORKER_BATCH_SIZE,
        select: {
          id: true,
          kind: true,
          userId: true,
          recipientEmail: true,
          scheduledFor: true,
          expiresAt: true,
          attempts: true,
          referenceId: true,
          payloadJson: true,
        },
      });

      for (const row of due) {
        await this.processOne(row, now);
      }

      return due.length;
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  // Infra necessária para ENVIAR este tipo. Transporte fake (fora de
  // produção) não precisa de nada.
  private isKindReady(kind: EmailDispatchKind): boolean {
    if (!this.config.isRealTransportAllowed()) return true;
    return kind === "PURCHASE_CONFIRMATION"
      ? this.config.checkPurchaseSendReadiness().ready
      : this.config.checkSendReadiness().ready;
  }

  // PROCESSING travada (processo morreu no meio): NUNCA volta para
  // PENDING — não dá para provar que o SES não aceitou. Fica
  // OUTCOME_UNKNOWN até um evento conclusivo do webhook. Um UPDATE só,
  // condicional — atômico.
  private async recoverStaleProcessing(now: Date) {
    const result = await this.database.emailDispatch.updateMany({
      where: {
        status: "PROCESSING",
        updatedAt: {
          lt: new Date(now.getTime() - STALE_PROCESSING_THRESHOLD_MS),
        },
      },
      data: {
        status: "OUTCOME_UNKNOWN",
        outcomeUnknownAt: now,
        lastError:
          "stale PROCESSING recuperado pelo worker (processo provavelmente reiniciado durante o envio)",
      },
    });
    if (result.count > 0) {
      this.logger.warn(
        `email dispatch: ${result.count} stale PROCESSING recovered as OUTCOME_UNKNOWN (never retried)`,
      );
    }
  }

  private async expireOverdue(now: Date) {
    await this.database.emailDispatch.updateMany({
      where: { status: "PENDING", expiresAt: { lte: now } },
      data: { status: "CANCELLED", skippedReason: "expired" },
    });
  }

  private async processOne(row: DispatchRow, now: Date) {
    // Claim atômico: só uma instância/tick vence.
    const claim = await this.database.emailDispatch.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: { status: "PROCESSING" },
    });
    if (claim.count !== 1) {
      return;
    }

    let sendStarted = false;
    try {
      await this.decideAndSend(row, now, () => {
        sendStarted = true;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      if (sendStarted) {
        // Falha DURANTE/DEPOIS da chamada ao provider — ambíguo, nunca
        // reenvia.
        this.logger.warn(
          `email dispatch ${row.id} raised after send started, marking OUTCOME_UNKNOWN (never retried): ${message}`,
        );
        await this.database.emailDispatch.update({
          where: { id: row.id },
          data: {
            status: "OUTCOME_UNKNOWN",
            lastError: message,
            outcomeUnknownAt: new Date(),
          },
        });
        return;
      }

      // Falha ANTES de qualquer envio — seguro tentar de novo, com o
      // mesmo orçamento de tentativas e backoff.
      this.logger.warn(
        `email dispatch ${row.id} failed before send: ${message}`,
      );
      await this.retryOrFail(row, now, message);
    }
  }

  private async decideAndSend(
    row: DispatchRow,
    now: Date,
    markSendStarted: () => void,
  ) {
    if (row.expiresAt <= now) {
      await this.close(row.id, "CANCELLED", "expired");
      return;
    }

    const mode = await this.config.getEffectiveMode(row.kind);
    if (mode === "OFF") {
      // Modo desligado entre a consulta e o claim — devolve intacto.
      await this.release(row.id);
      return;
    }

    const verdict =
      row.kind === "PURCHASE_CONFIRMATION"
        ? await this.eligibility.evaluatePurchaseConfirmation(row)
        : await this.eligibility.evaluate({ userId: row.userId });
    if (!verdict.eligible) {
      await this.close(row.id, "SKIPPED", verdict.reason);
      return;
    }

    if (row.kind === "FEEDBACK_FIRST_USE") {
      const deferral = await this.resolveFeedbackDeferral(row, now);
      if (deferral) {
        if (deferral.until >= row.expiresAt) {
          // Adiar passaria do prazo: descarta com motivo explícito.
          await this.close(
            row.id,
            "CANCELLED",
            `${deferral.reason}_past_expiry`,
          );
          return;
        }
        await this.database.emailDispatch.update({
          where: { id: row.id },
          data: {
            status: "PENDING",
            scheduledFor: deferral.until,
            skippedReason: null,
          },
        });
        return;
      }
    }

    const variant =
      row.kind === "FEEDBACK_FIRST_USE"
        ? await this.dispatchService.resolveFeedbackVariant(verdict.user.id)
        : null;

    if (mode === "SHADOW") {
      // Renderiza para provar que o template funciona com estes dados,
      // grava a variante que SERIA usada, e fecha sem enviar.
      await this.dispatchService.render({
        kind: row.kind,
        name: verdict.user.name,
        variant,
        payload: row.payloadJson as PurchaseConfirmationPayload | null,
      });
      await this.database.emailDispatch.update({
        where: { id: row.id },
        data: { status: "SKIPPED", skippedReason: "shadow_mode", variant },
      });
      return;
    }

    if (
      mode === "ALLOWLIST" &&
      !(await this.config.isAllowlisted(verdict.user.email))
    ) {
      await this.close(row.id, "SKIPPED", "not_allowlisted");
      return;
    }

    if (!this.isKindReady(row.kind)) {
      // Infra de envio incompleta — nada foi tentado; devolve sem gastar
      // tentativa (expira sozinho se continuar assim).
      await this.release(row.id);
      return;
    }

    await this.database.emailDispatch.update({
      where: { id: row.id },
      data: { variant },
    });

    markSendStarted();
    const result = await this.dispatchService.deliver({
      dispatchId: row.id,
      kind: row.kind,
      to: verdict.user.email,
      name: verdict.user.name,
      variant,
      payload: row.payloadJson as PurchaseConfirmationPayload | null,
      // Real só em produção. Fora dela (inclusive ALLOWLIST) o serviço usa
      // transporte fake e nada sai pela rede.
      realTransport: this.config.isRealTransportAllowed(),
    });

    if (result.outcome === "SENT") {
      await this.database.emailDispatch.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          lastError: null,
          outcomeUnknownAt: null,
        },
      });
      return;
    }

    if (result.outcome === "OUTCOME_UNKNOWN") {
      await this.database.emailDispatch.update({
        where: { id: row.id },
        data: {
          status: "OUTCOME_UNKNOWN",
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          lastError: result.errorMessage ?? null,
          outcomeUnknownAt: new Date(),
        },
      });
      return;
    }

    // FAILED: rejeição CONFIRMADA do provider — seguro tentar de novo.
    await this.retryOrFail(
      row,
      now,
      result.errorMessage ?? "provider rejected the send",
      result.provider,
    );
  }

  // Adiamentos do feedback (não são inelegibilidade):
  //  - fora de 08:00–20:00 (Brasília) -> próximo 08:00;
  //  - boas-vindas ainda não terminou (PENDING/PROCESSING), ou foi enviada
  //    há menos de 12h -> espera, nunca dois e-mails juntos.
  // Sempre limitado por expiresAt (o chamador descarta se passar).
  private async resolveFeedbackDeferral(
    row: DispatchRow,
    now: Date,
  ): Promise<{ until: Date; reason: string } | null> {
    const windowed = adjustToFeedbackWindow(now);
    if (windowed.getTime() !== now.getTime()) {
      return { until: windowed, reason: "outside_window" };
    }

    if (!row.userId) return null;
    const welcome = await this.database.emailDispatch.findUnique({
      where: { dedupeKey: `welcome:${row.userId}` },
      select: { status: true, sentAt: true },
    });
    if (!welcome) return null;

    if (welcome.status === "PENDING" || welcome.status === "PROCESSING") {
      return {
        until: adjustToFeedbackWindow(
          new Date(now.getTime() + WELCOME_RETRY_DEFER_MS),
        ),
        reason: "welcome_pending",
      };
    }

    if (welcome.sentAt) {
      const earliest = new Date(
        welcome.sentAt.getTime() + FEEDBACK_MIN_GAP_AFTER_WELCOME_MS,
      );
      if (earliest > now) {
        return {
          until: adjustToFeedbackWindow(earliest),
          reason: "welcome_too_recent",
        };
      }
    }

    return null;
  }

  private async retryOrFail(
    row: DispatchRow,
    now: Date,
    errorMessage: string,
    provider?: "RESEND" | "SES",
  ) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_SEND_ATTEMPTS) {
      await this.database.emailDispatch.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          attempts,
          lastError: errorMessage,
          ...(provider ? { provider } : {}),
        },
      });
      return;
    }

    await this.database.emailDispatch.update({
      where: { id: row.id },
      data: {
        status: "PENDING",
        attempts,
        lastError: errorMessage,
        scheduledFor: new Date(now.getTime() + RETRY_BACKOFF_MS * attempts),
        ...(provider ? { provider } : {}),
      },
    });
  }

  private async close(
    id: string,
    status: "SKIPPED" | "CANCELLED",
    skippedReason: string,
  ) {
    await this.database.emailDispatch.update({
      where: { id },
      data: { status, skippedReason },
    });
  }

  private async release(id: string) {
    await this.database.emailDispatch.update({
      where: { id },
      data: { status: "PENDING" },
    });
  }
}
