import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { DatabaseService } from "../database/database.service";
import { EmailDispatchConfigService } from "../email-dispatch/email-dispatch.config";
import { HOUR_MS } from "../email-dispatch/email-dispatch.constants";
import { EmailDispatchService } from "../email-dispatch/email-dispatch.service";
import { resolveAnalysisCreditsForPlan } from "./plans.service";

const DEFAULT_SINCE_HOURS = 24;
// Acima disto o recibo chegaria tão atrasado que não vale mais enviar.
const MAX_SINCE_HOURS = 72;
const MAX_PURCHASES_PER_RUN = 500;

export type MissingPurchaseConfirmation = {
  purchaseId: string;
  userId: string;
  planType: string;
  completedAt: Date;
};

export type RecoveryReport = {
  mode: "OFF" | "SHADOW" | "ALLOWLIST" | "LIVE";
  sinceHours: number;
  missing: MissingPurchaseConfirmation[];
  recovered: number;
  applied: boolean;
};

// Detecta e recupera confirmações de compra que NÃO chegaram a ser
// enfileiradas (ex.: o enqueue transacional falhou e foi absorvido pelo
// SAVEPOINT — os créditos estão corretos, só faltou a linha do e-mail).
//
//  - DETECÇÃO é automática e só LOGA (@Cron, token purchase_confirmation_missing):
//    nunca cria linha sozinha. Recriar sozinho poderia, ao ligar o modo mais
//    tarde, mandar recibos antigos que ninguém pediu.
//  - RECUPERAÇÃO é uma ação explícita (script, --apply), limitada a compras
//    concluídas nas últimas N horas (padrão 24h = a validade de um recibo),
//    idempotente (dedupe por compra) e respeita o modo/cutoff atuais.
@Injectable()
export class PurchaseConfirmationRecoveryService {
  private readonly logger = new Logger(
    PurchaseConfirmationRecoveryService.name,
  );

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EmailDispatchService)
    private readonly emailDispatch: EmailDispatchService,
    @Inject(EmailDispatchConfigService)
    private readonly config: EmailDispatchConfigService,
  ) {}

  async findMissing(
    sinceHours = DEFAULT_SINCE_HOURS,
    now: Date = new Date(),
  ): Promise<MissingPurchaseConfirmation[]> {
    const startAt = await this.config.getStartAt();
    if (!startAt) return [];

    const since = new Date(now.getTime() - sinceHours * HOUR_MS);
    const purchases = await this.database.planPurchase.findMany({
      where: {
        status: "completed",
        // Mesmo cutoff do enqueue: compra antiga nunca gera recibo.
        createdAt: { gte: startAt },
        OR: [{ paidAt: { gte: since } }, { couponRedeemedAt: { gte: since } }],
      },
      select: {
        id: true,
        userId: true,
        planType: true,
        paidAt: true,
        couponRedeemedAt: true,
      },
      orderBy: { updatedAt: "asc" },
      take: MAX_PURCHASES_PER_RUN,
    });
    if (purchases.length === 0) return [];

    const existing = await this.database.emailDispatch.findMany({
      where: {
        dedupeKey: { in: purchases.map((p) => `purchase:${p.id}`) },
      },
      select: { dedupeKey: true },
    });
    const have = new Set(existing.map((row) => row.dedupeKey));

    return purchases
      .filter((p) => !have.has(`purchase:${p.id}`))
      .map((p) => ({
        purchaseId: p.id,
        userId: p.userId,
        planType: p.planType,
        completedAt: (p.paidAt ?? p.couponRedeemedAt) as Date,
      }));
  }

  async recover(input: {
    sinceHours?: number;
    apply: boolean;
    now?: Date;
  }): Promise<RecoveryReport> {
    const sinceHours = Math.min(
      Math.max(input.sinceHours ?? DEFAULT_SINCE_HOURS, 1),
      MAX_SINCE_HOURS,
    );
    const now = input.now ?? new Date();
    const mode = await this.config.getEffectiveMode("PURCHASE_CONFIRMATION");
    const missing = await this.findMissing(sinceHours, now);

    // Modo OFF: nada é criado (o enqueue é no-op) — relata e para.
    if (!input.apply || mode === "OFF") {
      return { mode, sinceHours, missing, recovered: 0, applied: false };
    }

    let recovered = 0;
    for (const item of missing) {
      const purchase = await this.database.planPurchase.findUnique({
        where: { id: item.purchaseId },
        select: {
          planType: true,
          creditsGranted: true,
          analysisCreditsGranted: true,
        },
      });
      if (!purchase) continue;

      const isUnlimited = purchase.planType === "unlimited";
      const queued = await this.database.$transaction((tx) =>
        this.emailDispatch.enqueuePurchaseConfirmationInTransaction(
          tx,
          {
            purchaseId: item.purchaseId,
            userId: item.userId,
            creditsApplied: isUnlimited ? 0 : purchase.creditsGranted,
            analysisCreditsApplied: isUnlimited
              ? 0
              : resolveAnalysisCreditsForPlan(
                  purchase.planType,
                  purchase.analysisCreditsGranted,
                ),
            isUnlimited,
          },
          now,
        ),
      );
      if (queued) recovered += 1;
    }

    this.logger.log(
      `purchase_confirmation_recovered count=${recovered} of=${missing.length} sinceHours=${sinceHours}`,
    );
    return { mode, sinceHours, missing, recovered, applied: true };
  }

  // Detecção periódica (só log). Sem modo ligado não faz nada — zero pegada.
  @Cron("0 */10 * * * *")
  async auditTick() {
    if (process.env.NODE_ENV === "test") return;
    if ((await this.config.getEffectiveMode("PURCHASE_CONFIRMATION")) === "OFF")
      return;

    try {
      const missing = await this.findMissing();
      if (missing.length > 0) {
        this.logger.warn(
          `purchase_confirmation_missing count=${missing.length} oldest=${missing[0].completedAt.toISOString()} recover="npm run email:recover-purchase-confirmations -w apps/api -- --apply"`,
        );
      }
    } catch (error) {
      this.logger.error(
        `purchase_confirmation_audit_failed reason=${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }
}
