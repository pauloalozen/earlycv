import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { DatabaseService } from "../database/database.service";
import { IngestionService } from "./ingestion.service";
import { IngestionLockRepository } from "./ingestion-lock.repository";

const MANUAL_RUNNER_LOCK_ID = "manual-ingestion-batch-runner";
const MANUAL_RUNNER_LOCK_TTL_MS = 60_000;
const ITEM_LOCK_TTL_MS = 10 * 60_000;

function clampRunAggregate(
  totalSources: number,
  succeededCount: number,
  failedCount: number,
  skippedCount: number,
) {
  let succeeded = Math.max(0, succeededCount);
  let failed = Math.max(0, failedCount);
  let skipped = Math.max(0, skippedCount);
  let overflow = succeeded + failed + skipped - Math.max(0, totalSources);

  if (overflow > 0) {
    const skippedDecrement = Math.min(skipped, overflow);
    skipped -= skippedDecrement;
    overflow -= skippedDecrement;
  }
  if (overflow > 0) {
    const failedDecrement = Math.min(failed, overflow);
    failed -= failedDecrement;
    overflow -= failedDecrement;
  }
  if (overflow > 0) {
    const succeededDecrement = Math.min(succeeded, overflow);
    succeeded -= succeededDecrement;
  }

  return {
    failedCount: failed,
    skippedCount: skipped,
    succeededCount: succeeded,
  };
}

function isMissingManualBatchTableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const prismaError = error as Error & {
    code?: string;
    meta?: { modelName?: string; table?: string };
  };

  return (
    prismaError.code === "P2021" &&
    (prismaError.meta?.modelName === "IngestionBatchRun" ||
      prismaError.meta?.modelName === "IngestionBatchItem")
  );
}

@Injectable()
export class IngestionManualRunnerService {
  private readonly logger = new Logger(IngestionManualRunnerService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionService)
    private readonly ingestionService: IngestionService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
  ) {}

  @Cron("*/10 * * * * *")
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    try {
      await this.processNextBatchRun();
    } catch (error) {
      if (isMissingManualBatchTableError(error)) {
        this.logger.warn(
          "manual ingestion runner disabled: missing manual ingestion tables (run database migrations)",
        );
        return;
      }
      throw error;
    }
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
    if (
      runBeforeLoop.cancelRequestedAt ||
      runBeforeLoop.status === "cancelling"
    ) {
      await this.finalizeCancelledRun(batchRunId, runBeforeLoop.id);
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
        await this.finalizeCancelledRun(batchRunId, latestRun.id);
        return;
      }

      const markRunningResult =
        await this.database.ingestionBatchItem.updateMany({
          where: { id: item.id, status: { in: ["queued"] } },
          data: { startedAt: new Date(), status: "running" },
        });
      if (markRunningResult.count === 0) {
        continue;
      }

      const itemOwner = `${owner}:${item.id}`;
      const itemLockId = `job-source:${item.jobSourceId}`;
      const sourceLockAcquired = await this.lockRepository.acquire(
        itemLockId,
        itemOwner,
        ITEM_LOCK_TTL_MS,
      );

      if (!sourceLockAcquired) {
        const markSkippedResult =
          await this.database.ingestionBatchItem.updateMany({
            where: { id: item.id, status: { in: ["running"] } },
            data: { finishedAt: new Date(), status: "skipped" },
          });
        if (markSkippedResult.count > 0) {
          await this.database.ingestionBatchRun.update({
            where: { id: batchRunId },
            data: { skippedCount: { increment: 1 } },
          });
        }
        continue;
      }

      try {
        await this.ingestionService.runJobSource(item.jobSourceId);
        const markCompletedResult =
          await this.database.ingestionBatchItem.updateMany({
            where: { id: item.id, status: { in: ["queued", "running"] } },
            data: {
              errorMessage: null,
              finishedAt: new Date(),
              status: "completed",
            },
          });
        if (markCompletedResult.count > 0) {
          await this.database.ingestionBatchRun.update({
            where: { id: batchRunId },
            data: { succeededCount: { increment: 1 } },
          });
        }
      } catch (error) {
        const markFailedResult =
          await this.database.ingestionBatchItem.updateMany({
            where: { id: item.id, status: { in: ["queued", "running"] } },
            data: {
              errorMessage:
                error instanceof Error ? error.message : "ingestion failed",
              finishedAt: new Date(),
              status: "failed",
            },
          });
        if (markFailedResult.count > 0) {
          await this.database.ingestionBatchRun.update({
            where: { id: batchRunId },
            data: { failedCount: { increment: 1 } },
          });
        }
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
      await this.finalizeCancelledRun(batchRunId, latestRun.id);
      return;
    }

    await this.finalizeRun(batchRunId, latestRun.id, false);
  }

  private async finalizeCancelledRun(batchRunId: string, runId: string) {
    await this.cancelRemainingItems(batchRunId);
    await this.finalizeRun(batchRunId, runId, true);
  }

  private async finalizeRun(
    batchRunId: string,
    runId: string,
    cancelled: boolean,
  ) {
    const run = await this.database.ingestionBatchRun.findUnique({
      where: { id: runId },
    });
    if (!run) {
      return;
    }

    const counters = await this.recomputeRunCounters(
      batchRunId,
      run.totalSources,
    );
    const status = cancelled
      ? "cancelled"
      : counters.failedCount > 0
        ? "failed"
        : "completed";
    await this.database.ingestionBatchRun.update({
      where: { id: runId },
      data: {
        finishedAt: new Date(),
        ...counters,
        status,
      },
    });
  }

  private async recomputeRunCounters(batchRunId: string, totalSources: number) {
    const items = await this.database.ingestionBatchItem.findMany({
      where: { batchRunId },
    });

    let succeededCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    for (const item of items) {
      if (item.status === "completed") {
        succeededCount += 1;
      } else if (item.status === "failed") {
        failedCount += 1;
      } else if (item.status === "skipped" || item.status === "cancelled") {
        skippedCount += 1;
      }
    }

    return clampRunAggregate(
      totalSources,
      succeededCount,
      failedCount,
      skippedCount,
    );
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
