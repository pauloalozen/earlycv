import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { DatabaseService } from "../database/database.service";
import { doesCronMatchDate } from "./cron-utils";
import { GlobalSchedulerConfigService } from "./global-scheduler-config.service";
import { IngestionLockRepository } from "./ingestion-lock.repository";
import { IngestionService } from "./ingestion.service";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class IngestionSchedulerService {
  private readonly logger = new Logger(IngestionSchedulerService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionService) private readonly ingestionService: IngestionService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
    @Inject(GlobalSchedulerConfigService)
    private readonly globalConfigService: GlobalSchedulerConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    await this.runSourceSchedules();
    await this.runGlobalScheduleIfDue();
  }

  private async runSourceSchedules() {
    const now = new Date();
    const owner = `source-cron-${now.toISOString()}`;
    const sources = await this.database.jobSource.findMany({
      where: {
        isActive: true,
        scheduleEnabled: true,
        scheduleCron: { not: null },
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    });

    for (const source of sources) {
      if (!source.scheduleCron || !doesCronMatchDate(source.scheduleCron, now)) {
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

  async runGlobalNow() {
    const owner = `global-cron-${Date.now()}`;
    const acquired = await this.lockRepository.acquire(
      "global-ingestion",
      owner,
      60 * 60_000,
    );

    if (!acquired) {
      return { status: "skipped_locked" } as const;
    }

    try {
      const config = await this.globalConfigService.getConfig();
      const sources = await this.database.jobSource.findMany({
        where: { isActive: true },
        include: { company: true },
        orderBy: [
          { company: { name: "asc" } },
          { sourceName: "asc" },
          { id: "asc" },
        ],
      });

      let failed = 0;
      let succeeded = 0;
      let skipped = 0;

      for (const source of sources) {
        const sourceLockOwner = `${owner}:${source.id}`;
        const sourceLockAcquired = await this.lockRepository.acquire(
          `job-source:${source.id}`,
          sourceLockOwner,
          10 * 60_000,
        );

        if (!sourceLockAcquired) {
          skipped += 1;
          continue;
        }

        try {
          await this.ingestionService.runJobSource(source.id);
          succeeded += 1;
          await sleep(config.normalDelayMs);
        } catch (error) {
          failed += 1;
          this.logger.warn(
            `failed global run for ${source.id}: ${error instanceof Error ? error.message : "unknown"}`,
          );
          await sleep(config.errorDelayMs);
        } finally {
          await this.lockRepository.release(`job-source:${source.id}`, sourceLockOwner);
        }
      }

      return { failed, skipped, status: "completed", succeeded } as const;
    } finally {
      await this.lockRepository.release("global-ingestion", owner);
    }
  }
}
