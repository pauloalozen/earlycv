import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  IngestionBatchItemStatus,
  IngestionBatchRunStatus,
  IngestionBatchScopeType,
  JobSourceType,
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
  return (
    modelName === "IngestionBatchRun" || modelName === "IngestionBatchItem"
  );
}

type CreateAdapterBatchRunInput = {
  adapterType: JobSourceType;
  requestedByUserId?: string;
};

type CreateGlobalBatchRunInput = {
  requestedByUserId?: string;
};

type CreateSourceBatchRunInput = {
  jobSourceId: string;
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

  // scheduleEnabled=true e o unico jeito do admin dizer "essa fonte
  // participa de jobs em lote" — sem esse filtro, um job de escopo
  // ADAPTER pegava TODAS as fontes isActive daquele tipo (ex: as 79 do
  // gupy) mesmo quando so 2 estavam com o toggle ligado na aba Fontes,
  // desperdicando processamento nas 77 restantes so pra pula-las depois.
  async createAdapterBatchRun(input: CreateAdapterBatchRunInput) {
    try {
      return this.database.$transaction(async (tx) => {
        const sources = await tx.jobSource.findMany({
          where: {
            isActive: true,
            OR: [{ pausedUntil: null }, { pausedUntil: { lte: new Date() } }],
            scheduleEnabled: true,
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

  // Mirrors createAdapterBatchRun, but without the sourceType filter —
  // every scheduleEnabled source across every adapter, not just one.
  async createGlobalBatchRun(input: CreateGlobalBatchRunInput) {
    try {
      return this.database.$transaction(async (tx) => {
        const sources = await tx.jobSource.findMany({
          where: {
            isActive: true,
            OR: [{ pausedUntil: null }, { pausedUntil: { lte: new Date() } }],
            scheduleEnabled: true,
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
            scopeType: "global",
            scopeValue: "all",
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

  // Cria um batch de 1 fonte so, usado por IngestionJob de escopo SOURCE.
  // Diferente de createAdapterBatchRun/createGlobalBatchRun, ignora
  // scheduleEnabled — o escopo do job ja define explicitamente qual fonte
  // rodar, entao esse flag legado nao se aplica aqui.
  async createSourceBatchRun(input: CreateSourceBatchRunInput) {
    try {
      return this.database.$transaction(async (tx) => {
        const source = await tx.jobSource.findUnique({
          where: { id: input.jobSourceId },
          select: {
            company: { select: { name: true } },
            companyId: true,
            id: true,
            isActive: true,
            pausedUntil: true,
            sourceName: true,
            sourceType: true,
          },
        });

        if (!source) {
          throw new NotFoundException(
            `job source ${input.jobSourceId} not found`,
          );
        }

        const isPaused =
          source.pausedUntil !== null && source.pausedUntil > new Date();
        const eligible = source.isActive && !isPaused;

        const batchRun = await tx.ingestionBatchRun.create({
          data: {
            requestedByUserId: input.requestedByUserId,
            scopeType: "source",
            scopeValue: source.id,
            status: "queued",
            totalSources: eligible ? 1 : 0,
          },
        });

        if (eligible) {
          await tx.ingestionBatchItem.create({
            data: {
              batchRunId: batchRun.id,
              companyId: source.companyId,
              companyName: source.company.name,
              jobSourceId: source.id,
              sourceName: source.sourceName,
              sourceType: source.sourceType,
              status: "queued",
            },
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
        include: {
          ingestionRun: {
            select: {
              errorSummary: true,
              failedCount: true,
              newCount: true,
              skippedCount: true,
              updatedCount: true,
            },
          },
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
