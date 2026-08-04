import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { DatabaseService } from "../database/database.service";
import { doesCronMatchDate } from "./cron-utils";
import { GlobalSchedulerConfigService } from "./global-scheduler-config.service";
import { IngestionService } from "./ingestion.service";
import { IngestionLockRepository } from "./ingestion-lock.repository";
import { ManualIngestionBatchRepository } from "./manual-ingestion-batch.repository";

@Injectable()
export class IngestionSchedulerService {
  private readonly logger = new Logger(IngestionSchedulerService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionService)
    private readonly ingestionService: IngestionService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
    @Inject(GlobalSchedulerConfigService)
    private readonly globalConfigService: GlobalSchedulerConfigService,
    @Inject(ManualIngestionBatchRepository)
    private readonly manualBatchRepository: ManualIngestionBatchRepository,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    await this.ingestionService.recoverStaleRuns();
    await this.runSourceSchedules();
    await this.runGlobalScheduleIfDue();
  }

  private async runSourceSchedules() {
    const now = new Date();
    const owner = `source-cron-${now.toISOString()}`;
    const sources = await this.database.jobSource.findMany({
      where: {
        isActive: true,
        OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
        scheduleEnabled: true,
        scheduleCron: { not: null },
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    });

    for (const source of sources) {
      if (
        !source.scheduleCron ||
        !doesCronMatchDate(source.scheduleCron, now)
      ) {
        continue;
      }

      const acquired = await this.lockRepository.acquire(
        `job-source:${source.id}`,
        owner,
        10 * 60_000,
      );

      if (!acquired) {
        continue;
      }

      try {
        await this.ingestionService.runJobSource(source.id);
      } catch (error) {
        this.logger.warn(
          `failed source schedule ${source.id}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      } finally {
        await this.lockRepository.release(`job-source:${source.id}`, owner);
      }
    }
  }

  async runGlobalScheduleIfDue() {
    const config = await this.globalConfigService.getConfig();

    if (!config.enabled || !config.globalCron) {
      return { status: "disabled" } as const;
    }

    const now = new Date();
    if (!doesCronMatchDate(config.globalCron, now)) {
      return { status: "not_due" } as const;
    }

    return this.runGlobalNow();
  }

  // Enqueues an async batch (scheduleEnabled sources only, same as the
  // automatic per-minute scheduler would pick up) instead of running
  // sources sequentially in-process. The manual batch runner cron
  // (IngestionManualRunnerService, every 10s) processes it — this call
  // returns immediately.
  async runGlobalNow(requestedByUserId?: string) {
    const run = await this.manualBatchRepository.createGlobalBatchRun({
      requestedByUserId,
    });

    return {
      batchRunId: run.id,
      status: run.status,
      totalSources: run.totalSources,
    } as const;
  }
}
