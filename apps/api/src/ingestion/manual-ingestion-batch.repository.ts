import { Inject, Injectable } from "@nestjs/common";
import {
  type IngestionBatchItemStatus,
  type IngestionBatchRunStatus,
  type IngestionBatchScopeType,
  type JobSourceType,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";

function isMissingManualBatchTableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const prismaError = error as Error & {
    code?: string;
    meta?: { modelName?: string; table?: string };
  };

  if (prismaError.code !== "P2021") {
    return false;
  }

  const modelName = prismaError.meta?.modelName;
  return modelName === "IngestionBatchRun" || modelName === "IngestionBatchItem";
}

type CreateAdapterBatchRunInput = {
  adapterType: JobSourceType;
  requestedByUserId?: string;
};

type ListRunsFilters = {
  status?: IngestionBatchRunStatus;
  scopeType?: IngestionBatchScopeType;
};

type ListRunItemsFilters = {
  status?: IngestionBatchItemStatus;
};

@Injectable()
export class ManualIngestionBatchRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async createAdapterBatchRun(input: CreateAdapterBatchRunInput) {
    try {
      return this.database.$transaction(async (tx) => {
        const sources = await tx.jobSource.findMany({
          where: {
            isActive: true,
            sourceType: input.adapterType,
          },
          select: {
            company: { select: { name: true } },
            companyId: true,
            id: true,
            sourceName: true,
            sourceType: true,
          },
        });

        const batchRun = await tx.ingestionBatchRun.create({
          data: {
            requestedByUserId: input.requestedByUserId,
            scopeType: "adapter",
            scopeValue: input.adapterType,
            status: "queued",
            totalSources: sources.length,
          },
        });

        if (sources.length > 0) {
          await tx.ingestionBatchItem.createMany({
            data: sources.map((source) => ({
              batchRunId: batchRun.id,
              companyId: source.companyId,
              companyName: source.company.name,
              jobSourceId: source.id,
              sourceName: source.sourceName,
              sourceType: source.sourceType,
              status: "queued",
            })),
          });
        }

        return batchRun;
      });
    } catch (error) {
      if (isMissingManualBatchTableError(error)) {
        throw new Error(
          "Manual ingestion tables are missing. Apply database migrations before starting manual runs.",
        );
      }
      throw error;
    }
  }

  async listRuns(filters: ListRunsFilters = {}) {
    try {
      return this.database.ingestionBatchRun.findMany({
        where: {
          scopeType: filters.scopeType,
          status: filters.status,
        },
        orderBy: { createdAt: "desc" },
      });
    } catch (error) {
      if (isMissingManualBatchTableError(error)) {
        return [];
      }
      throw error;
    }
  }

  async getRunById(batchRunId: string) {
    try {
      return this.database.ingestionBatchRun.findUnique({
        where: { id: batchRunId },
      });
    } catch (error) {
      if (isMissingManualBatchTableError(error)) {
        return null;
      }
      throw error;
    }
  }

  async listRunItems(batchRunId: string, filters: ListRunItemsFilters = {}) {
    try {
      return this.database.ingestionBatchItem.findMany({
        where: {
          batchRunId,
          status: filters.status,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
    } catch (error) {
      if (isMissingManualBatchTableError(error)) {
        return [];
      }
      throw error;
    }
  }

  async markCancelRequested(batchRunId: string) {
    try {
      await this.database.ingestionBatchRun.updateMany({
        where: { id: batchRunId, status: { in: ["queued", "running"] } },
        data: {
          status: "cancelling",
          cancelRequestedAt: new Date(),
        },
      });

      return this.database.ingestionBatchRun.findUnique({
        where: { id: batchRunId },
      });
    } catch (error) {
      if (isMissingManualBatchTableError(error)) {
        return null;
      }
      throw error;
    }
  }
}
