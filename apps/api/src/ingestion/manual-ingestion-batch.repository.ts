import { Inject, Injectable } from "@nestjs/common";
import {
  type IngestionBatchItemStatus,
  type IngestionBatchRunStatus,
  type IngestionBatchScopeType,
  type JobSourceType,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";

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
  }

  async listRuns(filters: ListRunsFilters = {}) {
    return this.database.ingestionBatchRun.findMany({
      where: {
        scopeType: filters.scopeType,
        status: filters.status,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getRunById(batchRunId: string) {
    return this.database.ingestionBatchRun.findUnique({
      where: { id: batchRunId },
    });
  }

  async listRunItems(batchRunId: string, filters: ListRunItemsFilters = {}) {
    return this.database.ingestionBatchItem.findMany({
      where: {
        batchRunId,
        status: filters.status,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async markCancelRequested(batchRunId: string) {
    return this.database.ingestionBatchRun.update({
      where: { id: batchRunId },
      data: {
        status: "cancelling",
        cancelRequestedAt: new Date(),
      },
    });
  }
}
