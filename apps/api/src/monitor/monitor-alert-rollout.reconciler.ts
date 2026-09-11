import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { MonitorAlertBulkSegment } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";

const LOCK_ID = "monitor-alert-rollout-reconciler";
const LOCK_TTL_MS = 60_000;

// Só ALL/PAID têm sentido pra política contínua — ver
// AdminMonitorService.ROLLOUT_POLICY_SEGMENTS (mesma restrição, validada lá
// na escrita; aqui é defesa em profundidade caso a linha singleton tenha
// sido criada direto no banco com outro valor).
const RECONCILABLE_SEGMENTS = new Set<MonitorAlertBulkSegment>([
  "ALL",
  "PAID",
]);

// Mantém a auto-inscrição em MonitorAlertRolloutPolicy funcionando pra
// usuário NOVO (ou pagante novo) sem tocar em auth.service.ts/
// plans.service.ts — os fluxos críticos de signup/pagamento nunca sabem
// que essa política existe. Em vez disso, esse job varre periodicamente
// quem já deveria estar inscrito e ainda não está. O preço é um atraso de
// minutos (não instantâneo), aceito de propósito em troca de risco zero
// pros fluxos de auth/pagamento.
//
// Só CRIA MonitorAlertPreference pra quem NUNCA teve uma linha — nunca
// atualiza uma linha existente. Isso já garante sozinho que ninguém que
// deu unsubscribe (ou que um admin desativou manualmente) seja
// re-inscrito: quem já tem linha, de qualquer status, nunca é tocado aqui.
@Injectable()
export class MonitorAlertRolloutReconciler {
  private readonly logger = new Logger(MonitorAlertRolloutReconciler.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
  ) {}

  @Cron("*/5 * * * *")
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    await this.reconcile();
  }

  async reconcile(): Promise<{ enrolledCount: number }> {
    const owner = `monitor-alert-rollout-reconciler-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );
    if (!acquired) {
      return { enrolledCount: 0 };
    }

    try {
      const policy = await this.database.monitorAlertRolloutPolicy.findUnique(
        { where: { id: "default" } },
      );
      if (!policy?.active || !RECONCILABLE_SEGMENTS.has(policy.segment)) {
        return { enrolledCount: 0 };
      }
      if (policy.cutoffAt && new Date() > policy.cutoffAt) {
        return { enrolledCount: 0 };
      }

      const candidateIds = await this.resolveUnenrolledCandidates(
        policy.segment,
      );
      if (candidateIds.length === 0) {
        return { enrolledCount: 0 };
      }

      const { count } = await this.database.monitorAlertPreference.createMany(
        {
          data: candidateIds.map((userId) => ({
            userId,
            emailEnabled: true,
          })),
          skipDuplicates: true,
        },
      );

      if (count > 0) {
        await this.database.monitorAdminActionLog.create({
          data: {
            adminId: "system",
            action: "alert_rollout_reconciled",
            entityType: "MonitorAlertRolloutPolicy",
            entityId: "default",
            result: "ok",
            metadataJson: { segment: policy.segment, enrolledCount: count },
          },
        });
        await this.database.monitorAlertRolloutPolicy.update({
          where: { id: "default" },
          data: { lastAppliedAt: new Date() },
        });
      }

      return { enrolledCount: count };
    } catch (error) {
      this.logger.warn(
        `alert rollout reconciliation failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
      return { enrolledCount: 0 };
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  private async resolveUnenrolledCandidates(
    segment: MonitorAlertBulkSegment,
  ): Promise<string[]> {
    const users = await this.database.user.findMany({
      where: {
        monitorAlertPreference: null,
        ...(segment === "PAID"
          ? { planPurchases: { some: { status: "completed" } } }
          : {}),
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
}
