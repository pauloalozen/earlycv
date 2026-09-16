import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import { APP_ENV, type AppEnv } from "../config/env.module";
import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { ProductUpdateEmailService } from "./product-update-email.service";

const LOCK_ID = "product-update-sender-worker";
const LOCK_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;
// Mesmo threshold do MonitorDigestWorker — tempo o bastante pra descartar
// uma PROCESSING legítima (envio em andamento), curto o bastante pra não
// deixar uma campanha travada por muito tempo depois de um crash real.
const STALE_PROCESSING_THRESHOLD_MS = 10 * 60_000;

// Envia as ProductUpdateDelivery que ProductUpdatesService.start() marcou
// PENDING — worker separado do serviço de ciclo de vida, mesmo raciocínio
// do MonitorDigestWorker. DIVERGE deliberadamente do padrão do Monitor em
// dois pontos de segurança (ver comentários abaixo): PROCESSING travada
// nunca volta para PENDING, e qualquer erro inesperado durante o envio
// também nunca volta para PENDING — os dois sempre viram OUTCOME_UNKNOWN,
// porque aqui não há como provar que a chamada ao SES não foi aceita antes
// da falha. Duplicar um comunicado institucional em massa é um problema de
// imagem pior do que um alerta de vaga duplicado.
@Injectable()
export class ProductUpdateSenderWorker {
  private readonly logger = new Logger(ProductUpdateSenderWorker.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
    @Inject(ProductUpdateEmailService)
    private readonly emailService: ProductUpdateEmailService,
    @Inject(BusinessFunnelEventService)
    private readonly funnelEvents: BusinessFunnelEventService,
    @Inject(APP_ENV)
    private readonly env: Pick<
      AppEnv,
      "PRODUCT_UPDATES_ENABLED" | "PRODUCT_UPDATE_SEND_RATE_PER_SECOND"
    >,
  ) {}

  @Cron("*/1 * * * * *")
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    if (!this.env.PRODUCT_UPDATES_ENABLED) {
      return;
    }
    await this.processPendingBatch();
  }

  // Gate em profundidade: mesmo que este método seja chamado diretamente
  // (não só via tick(), ex.: um futuro "enviar agora" administrativo, ou
  // um teste que esqueça de checar a flag antes), a checagem acontece
  // aqui dentro também, antes de qualquer aquisição de lock, consulta de
  // PENDING ou chamada ao EmailService — nunca só em tick().
  async processPendingBatch() {
    if (!this.env.PRODUCT_UPDATES_ENABLED) {
      return 0;
    }

    const owner = `product-update-sender-worker-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );
    if (!acquired) {
      return 0;
    }

    try {
      await this.recoverStaleProcessing();

      const batchSize = Math.max(
        1,
        Math.round(this.env.PRODUCT_UPDATE_SEND_RATE_PER_SECOND),
      );
      // productUpdate.status: "SENDING" é obrigatório aqui — nunca envia
      // uma delivery cuja campanha-pai não está mais SENDING (cancelada,
      // ou qualquer outro estado). Isso sozinho já evita processar uma
      // delivery PENDING órfã; a checagem em processDelivery (logo antes
      // da chamada ao SES) fecha a janela restante de uma campanha ser
      // cancelada DEPOIS deste findMany mas ANTES do envio de fato.
      const pending = await this.database.productUpdateDelivery.findMany({
        where: { status: "PENDING", productUpdate: { status: "SENDING" } },
        orderBy: [{ createdAt: "asc" }],
        take: batchSize,
      });

      const touchedProductUpdateIds = new Set<string>();
      for (const delivery of pending) {
        await this.processDelivery(delivery);
        touchedProductUpdateIds.add(delivery.productUpdateId);
      }

      for (const productUpdateId of touchedProductUpdateIds) {
        await this.completeIfDone(productUpdateId);
      }

      return pending.length;
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  // Diferente do MonitorDigestWorker (que reverte para PENDING): aqui
  // nunca podemos provar que a tentativa anterior não chegou a ser aceita
  // pelo SES antes do worker morrer no meio do envio — tratamos sempre
  // como ambíguo.
  private async recoverStaleProcessing() {
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);
    const stuck = await this.database.productUpdateDelivery.findMany({
      where: { status: "PROCESSING" },
    });

    for (const item of stuck) {
      if (item.updatedAt >= staleThreshold) continue;

      this.logger.warn(
        `product update delivery ${item.id} recovered from stale PROCESSING as OUTCOME_UNKNOWN (nunca PENDING — ver comentário do worker)`,
      );
      await this.database.productUpdateDelivery.update({
        where: { id: item.id },
        data: {
          status: "OUTCOME_UNKNOWN",
          outcomeUnknownAt: new Date(),
          lastError:
            "stale PROCESSING recuperado pelo worker (processo provavelmente reiniciado durante o envio)",
        },
      });
    }
  }

  private async processDelivery(delivery: {
    id: string;
    productUpdateId: string;
    attempts: number;
  }) {
    await this.database.productUpdateDelivery.update({
      where: { id: delivery.id },
      data: { status: "PROCESSING" },
    });

    // Recheck IMEDIATAMENTE antes de chamar o SES — fecha a janela entre
    // o findMany (que já filtra productUpdate.status="SENDING") e agora:
    // um admin pode ter cancelado a campanha nesse meio-tempo. Nunca
    // chama sendToDelivery se a campanha não estiver mais SENDING. Só ids
    // e status no log — nunca e-mail/nome do destinatário.
    const productUpdate = await this.database.productUpdate.findUnique({
      where: { id: delivery.productUpdateId },
      select: { status: true },
    });

    if (productUpdate?.status !== "SENDING") {
      const parentStatus = productUpdate?.status ?? "not_found";
      this.logger.warn(
        `product update delivery ${delivery.id} skipped: campaign ${delivery.productUpdateId} is ${parentStatus}, not SENDING — never calling SES`,
      );
      await this.database.productUpdateDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "CANCELLED",
          lastError: `campaign status changed to ${parentStatus} before send`,
        },
      });
      return;
    }

    try {
      const result = await this.emailService.sendToDelivery(delivery.id);

      if (!result.sent) {
        // Falha CONFIRMADA antes de qualquer tentativa de rede (delivery/
        // snapshot ausente, list management não configurado) — nunca
        // ambígua, retry controlado como qualquer FAILED confirmado.
        const attempts = delivery.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        this.logger.warn(
          `product update delivery ${delivery.id} skipped at send time: ${result.skippedReason}`,
        );
        await this.database.productUpdateDelivery.update({
          where: { id: delivery.id },
          data: {
            attempts,
            lastError: result.skippedReason,
            status: failed ? "FAILED" : "PENDING",
          },
        });
        return;
      }

      if (result.outcome === "OUTCOME_UNKNOWN") {
        await this.database.productUpdateDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "OUTCOME_UNKNOWN",
            providerMessageId: result.providerMessageId,
            lastError: result.errorMessage ?? null,
            outcomeUnknownAt: new Date(),
          },
        });
        return;
      }

      if (result.outcome === "FAILED") {
        const attempts = delivery.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        await this.database.productUpdateDelivery.update({
          where: { id: delivery.id },
          data: {
            attempts,
            lastError: result.errorMessage ?? "provider rejected the send",
            status: failed ? "FAILED" : "PENDING",
          },
        });
        return;
      }

      await this.database.productUpdateDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          lastError: null,
          outcomeUnknownAt: null,
        },
      });
    } catch (error) {
      // Erro inesperado (ex.: falha de rede/DB no meio do processo) —
      // NUNCA volta para PENDING aqui: não há como provar que o SES não
      // aceitou o envio antes da exceção.
      const message = error instanceof Error ? error.message : "unknown error";
      this.logger.warn(
        `product update delivery ${delivery.id} raised an unexpected error, marking OUTCOME_UNKNOWN (never retried automatically): ${message}`,
      );
      await this.database.productUpdateDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "OUTCOME_UNKNOWN",
          lastError: message,
          outcomeUnknownAt: new Date(),
        },
      });
    }
  }

  // Terminalidade: uma campanha SENDING vira COMPLETED assim que não
  // sobra nenhuma delivery PENDING/PROCESSING — pode conter qualquer
  // mistura de SENT/FAILED/OUTCOME_UNKNOWN/CANCELLED, nunca exige que
  // todas tenham tido sucesso.
  private async completeIfDone(productUpdateId: string) {
    const productUpdate = await this.database.productUpdate.findUnique({
      where: { id: productUpdateId },
      select: { status: true },
    });
    if (productUpdate?.status !== "SENDING") {
      return;
    }

    const remaining = await this.database.productUpdateDelivery.count({
      where: {
        productUpdateId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    if (remaining > 0) {
      return;
    }

    await this.database.productUpdate.update({
      where: { id: productUpdateId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    const [sentCount, failedCount, outcomeUnknownCount, cancelledCount] =
      await Promise.all(
        (["SENT", "FAILED", "OUTCOME_UNKNOWN", "CANCELLED"] as const).map(
          (status) =>
            this.database.productUpdateDelivery.count({
              where: { productUpdateId, status },
            }),
        ),
      );

    // Sem PII no metadata — só contadores, nunca e-mail/nome/lista de
    // destinatários.
    this.funnelEvents
      .record(
        {
          eventName: "product_update_completed",
          eventVersion: 1,
          idempotencyKey: `product_update_completed:${productUpdateId}`,
          metadata: {
            productUpdateId,
            sentCount,
            failedCount,
            outcomeUnknownCount,
            cancelledCount,
          },
        },
        {
          correlationId: `product-update:${productUpdateId}`,
          ip: null,
          requestId: `product-update:${productUpdateId}`,
          routePath: "/api/admin/product-updates",
          sessionInternalId: null,
          sessionPublicToken: null,
          userAgentHash: null,
          userId: null,
        },
        "backend",
      )
      .catch((err: unknown) => {
        this.logger.warn(`failed to record product_update_completed: ${err}`);
      });
  }
}
