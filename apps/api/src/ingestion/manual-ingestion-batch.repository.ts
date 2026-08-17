import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  IngestionBatchItemStatus,
  IngestionBatchRunStatus,
  IngestionBatchScopeType,
  JobSourceType,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { LOGO_FETCH_SUPPORTED_ADAPTERS } from "./company-logo/logo-extractors";
import { QUEUE_HARD_CAP } from "./discovered-companies.service";

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

type CreateLogoFetchBatchRunInput = {
  // Ausente = todos os adapters com extractor de logo implementado (ver
  // LOGO_FETCH_SUPPORTED_ADAPTERS).
  adapterType?: JobSourceType;
  // true = pula companies que já têm logoUrl preenchido (delta).
  onlyMissingLogo?: boolean;
  requestedByUserId?: string;
};

type CreateDiscoveryValidateBatchRunInput = {
  // Ausente = fila inteira (ate o teto de seguranca QUEUE_HARD_CAP — ver
  // discovered-companies.service.ts).
  candidateLimit?: number;
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

  // Um item por Company (nao por JobSource) — diferente das 3 acima, uma
  // mesma empresa nunca entra 2x mesmo se tiver varias fontes elegiveis
  // (evita buscar/gravar o mesmo logo em duplicidade). Ignora
  // scheduleEnabled de proposito: esse flag e sobre participar de lotes de
  // CRAWL, nao tem relacao com busca de logo.
  async createLogoFetchBatchRun(input: CreateLogoFetchBatchRunInput) {
    try {
      return this.database.$transaction(async (tx) => {
        const sourceTypeFilter = input.adapterType
          ? [input.adapterType]
          : LOGO_FETCH_SUPPORTED_ADAPTERS;

        const sources = await tx.jobSource.findMany({
          where: {
            company: input.onlyMissingLogo ? { logoUrl: null } : undefined,
            isActive: true,
            OR: [{ pausedUntil: null }, { pausedUntil: { lte: new Date() } }],
            sourceType: { in: sourceTypeFilter },
          },
          select: {
            company: { select: { name: true } },
            companyId: true,
            id: true,
            sourceName: true,
            sourceType: true,
          },
          orderBy: { updatedAt: "desc" },
        });

        const seenCompanyIds = new Set<string>();
        const dedupedSources = sources.filter((source) => {
          if (seenCompanyIds.has(source.companyId)) return false;
          seenCompanyIds.add(source.companyId);
          return true;
        });

        const batchRun = await tx.ingestionBatchRun.create({
          data: {
            runKind: "LOGO_FETCH",
            requestedByUserId: input.requestedByUserId,
            scopeType: input.adapterType ? "adapter" : "global",
            scopeValue: input.adapterType ?? "all",
            status: "queued",
            totalSources: dedupedSources.length,
          },
        });

        if (dedupedSources.length > 0) {
          await tx.ingestionBatchItem.createMany({
            data: dedupedSources.map((source) => ({
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

  // Um item por DiscoveredCompany PENDING (nao por JobSource/Company — o
  // candidato pode nem ter nenhum dos dois ainda). candidateLimit vira o
  // teto de consultas de busca web daquela execucao tambem (ver
  // DiscoveredCompaniesService.validateOne, chamado 1x por item pelo
  // runner) — nao existe mais orcamento fixo por env var, o numero
  // escolhido aqui (no popup/job) e o teto de verdade.
  async createDiscoveryValidateBatchRun(
    input: CreateDiscoveryValidateBatchRunInput,
  ) {
    try {
      return this.database.$transaction(async (tx) => {
        const candidates = await tx.discoveredCompany.findMany({
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
          take: input.candidateLimit ?? QUEUE_HARD_CAP,
          where: { status: "PENDING" },
        });

        const batchRun = await tx.ingestionBatchRun.create({
          data: {
            runKind: "DISCOVERY_VALIDATE",
            requestedByUserId: input.requestedByUserId,
            scopeType: "global",
            scopeValue: input.candidateLimit
              ? String(input.candidateLimit)
              : "all",
            status: "queued",
            totalSources: candidates.length,
          },
        });

        if (candidates.length > 0) {
          await tx.ingestionBatchItem.createMany({
            data: candidates.map((candidate) => ({
              batchRunId: batchRun.id,
              companyName: candidate.name,
              discoveredCompanyId: candidate.id,
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
        include: {
          discoveredCompany: {
            select: { id: true, status: true },
          },
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
