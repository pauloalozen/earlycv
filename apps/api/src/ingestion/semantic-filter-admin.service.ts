import { Inject, Injectable } from "@nestjs/common";
import type { EnrichmentStatus, Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { SemanticFilterService } from "./semantic-filter.service";

type ListSkippedParams = {
  from?: string;
  page?: number;
  pageSize?: number;
  reasonKind?: "zona_cinza" | "noise_signal" | "tech_signal";
  sourceName?: string;
  to?: string;
};

type ListJobsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sourceId?: string;
  status?: EnrichmentStatus;
};

const CAREER_FINGERPRINT_PREVIEW_ITEMS = 3;
const ENRICHMENT_ERROR_PREVIEW_CHARS = 60;

function nextVersion(currentVersion: string | undefined) {
  if (!currentVersion) return "v1";
  const match = currentVersion.match(/^v(\d+)$/);
  if (!match) return `v${Date.now()}`;
  return `v${Number(match[1]) + 1}`;
}

@Injectable()
export class SemanticFilterAdminService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SemanticFilterService)
    private readonly semanticFilterService: SemanticFilterService,
  ) {}

  async getActiveConfig() {
    return this.database.semanticFilterConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async createNewVersion(input: {
    description?: string;
    noiseSignals: string[];
    techSignals: string[];
  }) {
    const current = await this.getActiveConfig();
    const version = nextVersion(current?.version);

    const created = await this.database.$transaction(async (tx) => {
      if (current) {
        await tx.semanticFilterConfig.update({
          where: { id: current.id },
          data: { isActive: false },
        });
      }

      return tx.semanticFilterConfig.create({
        data: {
          description: input.description ?? null,
          isActive: true,
          noiseSignals: input.noiseSignals,
          techSignals: input.techSignals,
          version,
        },
      });
    });

    this.semanticFilterService.invalidateCache();

    return created;
  }

  async listSkipped(params: ListSkippedParams) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.JobEnrichmentWhereInput = {
      enrichmentStatus: "SKIPPED",
    };

    if (params.reasonKind === "zona_cinza") {
      where.semanticFilterReason = "zona_cinza";
    } else if (params.reasonKind) {
      where.semanticFilterReason = { startsWith: `${params.reasonKind}:` };
    }

    const jobWhere: Prisma.JobWhereInput = {};

    if (params.from || params.to) {
      jobWhere.firstSeenAt = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    if (params.sourceName) {
      jobWhere.jobSource = {
        sourceName: { equals: params.sourceName, mode: "insensitive" },
      };
    }

    if (Object.keys(jobWhere).length > 0) {
      where.job = jobWhere;
    }

    const [rows, total] = await Promise.all([
      this.database.jobEnrichment.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
        include: {
          job: {
            select: {
              firstSeenAt: true,
              normalizedTitle: true,
              jobSource: { select: { sourceName: true } },
            },
          },
        },
      }),
      this.database.jobEnrichment.count({ where }),
    ]);

    return {
      page,
      pageSize,
      rows: rows.map((row) => ({
        enrichmentStatus: row.enrichmentStatus,
        firstSeenAt: row.job.firstSeenAt.toISOString(),
        id: row.id,
        normalizedTitle: row.job.normalizedTitle,
        semanticFilterReason: row.semanticFilterReason,
        sourceName: row.job.jobSource.sourceName,
      })),
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listJobs(params: ListJobsParams) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.JobEnrichmentWhereInput = {};
    if (params.status) {
      where.enrichmentStatus = params.status;
    }

    const jobWhere: Prisma.JobWhereInput = {};
    if (params.sourceId) {
      jobWhere.jobSourceId = params.sourceId;
    }
    if (params.search) {
      const term = params.search;
      jobWhere.OR = [
        { title: { contains: term, mode: "insensitive" } },
        { company: { name: { contains: term, mode: "insensitive" } } },
      ];
    }
    if (Object.keys(jobWhere).length > 0) {
      where.job = jobWhere;
    }

    const [rows, total] = await Promise.all([
      this.database.jobEnrichment.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
        include: {
          job: {
            select: {
              company: { select: { name: true } },
              createdAt: true,
              title: true,
            },
          },
        },
      }),
      this.database.jobEnrichment.count({ where }),
    ]);

    return {
      page,
      pageSize,
      rows: rows.map((row) => ({
        careerFingerprint: row.careerFingerprint.slice(
          0,
          CAREER_FINGERPRINT_PREVIEW_ITEMS,
        ),
        companyName: row.job.company.name,
        createdAt: row.job.createdAt.toISOString(),
        dominantArea: row.dominantArea,
        enrichedAt: row.enrichedAt?.toISOString() ?? null,
        enrichmentError: row.enrichmentError
          ? row.enrichmentError.slice(0, ENRICHMENT_ERROR_PREVIEW_CHARS)
          : null,
        enrichmentStatus: row.enrichmentStatus,
        id: row.id,
        jobTitle: row.job.title,
        semanticFilterReason: row.semanticFilterReason,
      })),
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async reenrich(jobEnrichmentId: string) {
    return this.database.jobEnrichment.update({
      where: { id: jobEnrichmentId },
      data: {
        attempts: 0,
        enrichmentError: null,
        enrichmentStatus: "PENDING",
        semanticFilterReason: null,
        semanticFilterResult: "PENDING",
      },
    });
  }

  async getDashboard() {
    const [pending, processing, completed, skipped, failed] = await Promise.all(
      [
        this.database.jobEnrichment.count({
          where: { enrichmentStatus: "PENDING" },
        }),
        this.database.jobEnrichment.count({
          where: { enrichmentStatus: "PROCESSING" },
        }),
        this.database.jobEnrichment.count({
          where: { enrichmentStatus: "COMPLETED" },
        }),
        this.database.jobEnrichment.count({
          where: { enrichmentStatus: "SKIPPED" },
        }),
        this.database.jobEnrichment.count({
          where: { enrichmentStatus: "FAILED" },
        }),
      ],
    );

    const filterDenominator = completed + skipped;
    const approvalRatePct =
      filterDenominator === 0
        ? null
        : Math.round((completed / filterDenominator) * 1000) / 10;

    return {
      approvalRatePct,
      completed,
      failed,
      pending,
      processing,
      skipped,
    };
  }
}
