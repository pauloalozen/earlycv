import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { randomUUID } from "node:crypto";

import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "./ingestion-lock.repository";
import { IngestionService } from "./ingestion.service";

const MANUAL_RUNNER_LOCK_ID = "manual-ingestion-batch-runner";
const MANUAL_RUNNER_LOCK_TTL_MS = 60_000;
const ITEM_LOCK_TTL_MS = 10 * 60_000;

@Injectable()
export class IngestionManualRunnerService {
  private readonly logger = new Logger(IngestionManualRunnerService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionService) private readonly ingestionService: IngestionService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
  ) {}

  @Cron("*/10 * * * * *")
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    await this.processNextBatchRun();
  }

  async processNextBatchRun() {
    const owner = `manual-runner-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      MANUAL_RUNNER_LOCK_ID,
      owner,
      MANUAL_RUNNER_LOCK_TTL_MS,
    );

    if (!acquired) {
      return;
    }

    try {
      const run = await this.database.ingestionBatchRun.findFirst({
        where: {
          status: { in: ["queued", "running", "cancelling"] },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      if (!run) {
        return;
      }

      if (run.status === "queued") {
        await this.database.ingestionBatchRun.update({
          where: { id: run.id },
          data: { startedAt: new Date(), status: "running" },
        });
      }

      await this.processRunItems(run.id, owner);
    } finally {
      await this.lockRepository.release(MANUAL_RUNNER_LOCK_ID, owner);
    }
  }

  private async processRunItems(batchRunId: string, owner: string) {
    const items = await this.database.ingestionBatchItem.findMany({
      where: {
        batchRunId,
        status: { in: ["queued", "running"] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const runBeforeLoop = await this.database.ingestionBatchRun.findUnique({
      where: { id: batchRunId },
    });
    if (!runBeforeLoop) {
      return;
    }
    if (runBeforeLoop.cancelRequestedAt || runBeforeLoop.status === "cancelling") {
      const cancelledCount = await this.cancelRemainingItems(batchRunId);
      await this.database.ingestionBatchRun.update({
        where: { id: batchRunId },
        data: {
          finishedAt: new Date(),
          skippedCount: runBeforeLoop.skippedCount + cancelledCount,
          status: "cancelled",
        },
      });
      return;
    }

    for (const item of items) {
      const latestRun = await this.database.ingestionBatchRun.findUnique({
        where: { id: batchRunId },
      });

      if (!latestRun) {
        return;
      }

      if (latestRun.cancelRequestedAt || latestRun.status === "cancelling") {
        const cancelledCount = await this.cancelRemainingItems(batchRunId);
        await this.database.ingestionBatchRun.update({
          where: { id: batchRunId },
          data: {
            finishedAt: new Date(),
            skippedCount: latestRun.skippedCount + cancelledCount,
            status: "cancelled",
          },
        });
        return;
      }

      await this.database.ingestionBatchItem.update({
        where: { id: item.id },
        data: { startedAt: new Date(), status: "running" },
      });

      const itemOwner = `${owner}:${item.id}`;
      const itemLockId = `job-source:${item.jobSourceId}`;
      const sourceLockAcquired = await this.lockRepository.acquire(
        itemLockId,
        itemOwner,
        ITEM_LOCK_TTL_MS,
      );

      if (!sourceLockAcquired) {
        await this.database.ingestionBatchItem.update({
          where: { id: item.id },
          data: { finishedAt: new Date(), status: "skipped" },
        });
        await this.database.ingestionBatchRun.update({
          where: { id: batchRunId },
          data: { skippedCount: { increment: 1 } },
        });
        continue;
      }

      try {
        await this.ingestionService.runJobSource(item.jobSourceId);
        await this.database.ingestionBatchItem.update({
          where: { id: item.id },
          data: {
            errorMessage: null,
            finishedAt: new Date(),
            status: "completed",
          },
        });
        await this.database.ingestionBatchRun.update({
          where: { id: batchRunId },
          data: { succeededCount: { increment: 1 } },
        });
      } catch (error) {
        await this.database.ingestionBatchItem.update({
          where: { id: item.id },
          data: {
            errorMessage: error instanceof Error ? error.message : "ingestion failed",
            finishedAt: new Date(),
            status: "failed",
          },
        });
        await this.database.ingestionBatchRun.update({
          where: { id: batchRunId },
          data: { failedCount: { increment: 1 } },
        });
        this.logger.warn(
          `manual ingestion item failed ${item.id}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      } finally {
        await this.lockRepository.release(itemLockId, itemOwner);
      }
    }

    const latestRun = await this.database.ingestionBatchRun.findUnique({
      where: { id: batchRunId },
    });
    if (!latestRun) {
      return;
    }

    if (latestRun.cancelRequestedAt || latestRun.status === "cancelling") {
      await this.database.ingestionBatchRun.update({
        where: { id: batchRunId },
        data: {
          finishedAt: new Date(),
          status: "cancelled",
        },
      });
      return;
    }

    const hasFailures = latestRun.failedCount > 0;
    await this.database.ingestionBatchRun.update({
      where: { id: batchRunId },
      data: {
        finishedAt: new Date(),
        status: hasFailures ? "failed" : "completed",
      },
    });
  }

  private async cancelRemainingItems(batchRunId: string) {
    const result = await this.database.ingestionBatchItem.updateMany({
      where: {
        batchRunId,
        status: { in: ["queued", "running"] },
      },
      data: {
        errorMessage: "cancelled",
        finishedAt: new Date(),
        status: "cancelled",
      },
    });

    return result.count;
  }
}
