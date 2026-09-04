import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { MonitorDigestEmailService } from "./monitor-digest-email.service";
import { MonitorEntitlementService } from "./monitor-entitlement.service";

const LOCK_ID = "monitor-digest-worker";
const LOCK_TTL_MS = 5 * 60_000;
const BASE_TICK_CRON = "*/30 * * * * *";
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;
const STALE_PROCESSING_THRESHOLD_MS = 10 * 60_000;

// Envia os digests que o MonitorDigestScheduler marcou PENDING — worker
// separado do scheduler (mesmo raciocínio de JobEnrichmentWorker): uma
// falha de e-mail (Resend fora do ar, rate limit, etc.) nunca deveria
// impedir o scheduler de descobrir os digests de amanhã, e retry aqui é
// só reprocessar a MESMA linha PENDING/PROCESSING, nunca recalcular quais
// recomendações entram (essas já foram fixadas pelo scheduler).
@Injectable()
export class MonitorDigestWorker {
  private readonly logger = new Logger(MonitorDigestWorker.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
    @Inject(MonitorDigestEmailService)
    private readonly emailService: MonitorDigestEmailService,
    @Inject(BusinessFunnelEventService)
    private readonly funnelEvents: BusinessFunnelEventService,
    @Inject(MonitorEntitlementService)
    private readonly entitlementService: MonitorEntitlementService,
  ) {}

  @Cron(BASE_TICK_CRON)
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    await this.processPendingBatch();
  }

  async processPendingBatch() {
    const owner = `monitor-digest-worker-${randomUUID()}`;
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

      const pending = await this.database.monitorDigest.findMany({
        where: { status: "PENDING" },
        orderBy: [{ createdAt: "asc" }],
        take: BATCH_SIZE,
      });

      for (const digest of pending) {
        await this.processDigest(digest);
      }

      return pending.length;
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  private async recoverStaleProcessing() {
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);
    const stuck = await this.database.monitorDigest.findMany({
      where: { status: "PROCESSING" },
    });

    for (const item of stuck) {
      if (item.updatedAt >= staleThreshold) continue;

      const attempts = item.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;

      this.logger.warn(
        `monitor digest ${item.id} recovered from stale PROCESSING (attempt ${attempts})`,
      );

      await this.database.monitorDigest.update({
        where: { id: item.id },
        data: {
          attempts,
          lastError:
            "stale PROCESSING recuperado pelo worker (processo provavelmente reiniciado durante o envio)",
          status: failed ? "FAILED" : "PENDING",
        },
      });
    }
  }

  private async processDigest(digest: {
    id: string;
    userId: string;
    attempts: number;
  }) {
    await this.database.monitorDigest.update({
      where: { id: digest.id },
      data: { status: "PROCESSING" },
    });

    try {
      const result = await this.emailService.sendDigest(digest.id);

      if (!result.sent) {
        this.logger.log(
          `monitor digest ${digest.id} skipped at send time: ${result.skippedReason}`,
        );
        await this.database.monitorDigest.update({
          where: { id: digest.id },
          data: { status: "SKIPPED" },
        });
        return;
      }

      await this.database.monitorDigest.update({
        where: { id: digest.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          lastError: null,
        },
      });

      await this.recordDigestSent(digest.id, digest.userId);
    } catch (error) {
      const attempts = digest.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      const message = error instanceof Error ? error.message : "unknown error";

      this.logger.warn(
        `monitor digest ${digest.id} (user ${digest.userId}) failed (attempt ${attempts}): ${message}`,
      );

      await this.database.monitorDigest.update({
        where: { id: digest.id },
        data: {
          attempts,
          lastError: message,
          status: failed ? "FAILED" : "PENDING",
        },
      });
    }
  }

  private async recordDigestSent(digestId: string, userId: string) {
    const { reason: accessType } =
      await this.entitlementService.canUseMonitor(userId);
    await this.funnelEvents
      .record(
        {
          eventName: "monitor_digest_sent",
          eventVersion: 1,
          idempotencyKey: `monitor_digest_sent:${digestId}`,
          metadata: {
            digestId,
            product_origin: "monitor_email",
            monitor_access_type: accessType,
          },
        },
        {
          correlationId: `monitor-digest:${digestId}`,
          ip: null,
          requestId: `monitor-digest:${digestId}`,
          routePath: "/api/monitor/digest",
          sessionInternalId: null,
          sessionPublicToken: null,
          userAgentHash: null,
          userId,
        },
        "backend",
      )
      .catch((err: unknown) => {
        this.logger.warn(
          `[monitor] failed to record monitor_digest_sent: ${err}`,
        );
      });
  }
}
