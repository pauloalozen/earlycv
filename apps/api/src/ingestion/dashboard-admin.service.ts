import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { IngestionService } from "./ingestion.service";

// Duplicado de apps/web/src/app/vagas/radar-ui.tsx (RADAR_AREA_LABELS) —
// não há pacote compartilhado entre api e web pra esse enum de labels.
const AREA_LABELS: Record<string, string> = {
  DATA_AI: "Dados & IA",
  SOFTWARE_ENGINEERING: "Engenharia de Software",
  CLOUD_DEVOPS: "Cloud & DevOps",
  CYBERSECURITY: "Segurança da Informação",
  PRODUCT: "Produto",
  DESIGN_UX: "Design & UX",
  QA_TEST: "QA & Testes",
  PROJECT_AGILE: "Gestão de Projetos",
  ARCHITECTURE: "Arquitetura",
  LEADERSHIP: "Liderança",
  GROWTH_MARKETING: "Growth & Marketing Digital",
  BUSINESS_ANALYTICS: "Business Analytics",
  CX_DIGITAL: "CX Digital",
  IT_SUPPORT: "Suporte & Infraestrutura TI",
  ERP_FUNCTIONAL: "SAP & ERP Funcional",
  OTHER: "Geral",
};

type AdapterRow = {
  adapterType: string;
  totalSources: number;
  activeSources: number;
  pausedSources: number;
  sourcesWith403: number;
  lastRunAt: string | null;
  runsLast24h: number;
  failedRunsLast24h: number;
  newJobsLast24h: number;
  nextJobRunAt: string | null;
};

@Injectable()
export class DashboardAdminService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionService) private readonly ingestionService: IngestionService,
  ) {}

  async getIngestionByAdapter(): Promise<{ adapters: AdapterRow[] }> {
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [allSources, runs24h, newJobs24h, activeSourceJobs] =
      await Promise.all([
        this.database.jobSource.findMany({
          select: {
            id: true,
            sourceType: true,
            isActive: true,
            pausedUntil: true,
            consecutive403Count: true,
            lastSuccessAt: true,
          },
        }),
        this.database.ingestionRun.findMany({
          where: { startedAt: { gte: cutoff24h } },
          select: { jobSourceId: true, status: true },
        }),
        this.database.job.findMany({
          where: { firstSeenAt: { gte: cutoff24h } },
          select: { jobSourceId: true },
        }),
        this.database.ingestionJob.findMany({
          where: {
            scopeType: "SOURCE",
            isEnabled: true,
            jobSourceId: { not: null },
            nextRunAt: { not: null },
          },
          select: { jobSourceId: true, nextRunAt: true },
        }),
      ]);

    const sourceIdToType = new Map(
      allSources.map((s) => [s.id, s.sourceType]),
    );

    const byAdapter = new Map<string, AdapterRow>();
    const bucket = (adapterType: string) => {
      let row = byAdapter.get(adapterType);
      if (!row) {
        row = {
          adapterType,
          totalSources: 0,
          activeSources: 0,
          pausedSources: 0,
          sourcesWith403: 0,
          lastRunAt: null,
          runsLast24h: 0,
          failedRunsLast24h: 0,
          newJobsLast24h: 0,
          nextJobRunAt: null,
        };
        byAdapter.set(adapterType, row);
      }
      return row;
    };

    for (const source of allSources) {
      const row = bucket(source.sourceType);
      row.totalSources += 1;
      if (source.isActive) row.activeSources += 1;
      if (source.pausedUntil && source.pausedUntil > now) {
        row.pausedSources += 1;
      }
      if (source.consecutive403Count > 0 && !source.pausedUntil) {
        row.sourcesWith403 += 1;
      }
      if (
        source.lastSuccessAt &&
        (!row.lastRunAt || source.lastSuccessAt.toISOString() > row.lastRunAt)
      ) {
        row.lastRunAt = source.lastSuccessAt.toISOString();
      }
    }

    for (const run of runs24h) {
      const adapterType = sourceIdToType.get(run.jobSourceId);
      if (!adapterType) continue;
      const row = bucket(adapterType);
      row.runsLast24h += 1;
      if (run.status === "failed") row.failedRunsLast24h += 1;
    }

    for (const job of newJobs24h) {
      const adapterType = sourceIdToType.get(job.jobSourceId);
      if (!adapterType) continue;
      bucket(adapterType).newJobsLast24h += 1;
    }

    for (const job of activeSourceJobs) {
      if (!job.jobSourceId || !job.nextRunAt) continue;
      const adapterType = sourceIdToType.get(job.jobSourceId);
      if (!adapterType) continue;
      const row = bucket(adapterType);
      const nextRunIso = job.nextRunAt.toISOString();
      if (!row.nextJobRunAt || nextRunIso < row.nextJobRunAt) {
        row.nextJobRunAt = nextRunIso;
      }
    }

    const adapters = [...byAdapter.values()].sort(
      (a, b) => b.totalSources - a.totalSources,
    );

    return { adapters };
  }

  async getEnrichmentSummary() {
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      enrichedCount,
      skippedCount,
      failedCount,
      pendingCount,
      areaGroups,
      crawlerDiscarded24h,
      completedEnrichments,
      pendingEnrichment,
    ] = await Promise.all([
      this.database.jobEnrichment.count({
        where: { enrichmentStatus: "COMPLETED", enrichedAt: { gte: cutoff24h } },
      }),
      // SKIPPED e FAILED nao preenchem enrichedAt (worker so seta esse campo
      // em COMPLETED) — usamos updatedAt como proxy da janela de 24h.
      this.database.jobEnrichment.count({
        where: { enrichmentStatus: "SKIPPED", updatedAt: { gte: cutoff24h } },
      }),
      this.database.jobEnrichment.count({
        where: { enrichmentStatus: "FAILED", updatedAt: { gte: cutoff24h } },
      }),
      // Pendentes e profundidade de fila atual, nao um evento com janela —
      // reportamos o total vigente, nao "pendente nas ultimas 24h".
      this.database.jobEnrichment.count({
        where: { enrichmentStatus: { in: ["PENDING", "PROCESSING"] } },
      }),
      this.database.jobEnrichment.groupBy({
        by: ["dominantArea"],
        where: { enrichmentStatus: "COMPLETED", enrichedAt: { gte: cutoff24h } },
        _count: { _all: true },
      }),
      this.database.crawlerDiscardedTitle.count({
        where: { discardedAt: { gte: cutoff24h } },
      }),
      this.database.jobEnrichment.findMany({
        where: { enrichmentStatus: "COMPLETED" },
        select: { dominantArea: true, job: { select: { status: true } } },
      }),
      this.database.job.count({
        where: {
          status: "active",
          OR: [
            { enrichment: null },
            {
              enrichment: {
                enrichmentStatus: { in: ["PENDING", "PROCESSING", "FAILED"] },
              },
            },
          ],
        },
      }),
    ]);

    const byArea = areaGroups
      .map((group) => ({
        area: group.dominantArea ?? "OTHER",
        count: group._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    const approvalRate =
      enrichedCount + skippedCount > 0
        ? Math.round((enrichedCount / (enrichedCount + skippedCount)) * 1000) /
          10
        : 0;

    const portalMap = new Map<
      string,
      { active: number; inactive: number; total: number }
    >();
    for (const row of completedEnrichments) {
      const area = row.dominantArea ?? "OTHER";
      const entry = portalMap.get(area) ?? { active: 0, inactive: 0, total: 0 };
      if (row.job.status === "active") entry.active += 1;
      else if (row.job.status === "inactive") entry.inactive += 1;
      entry.total = entry.active + entry.inactive;
      portalMap.set(area, entry);
    }
    const portalByArea = [...portalMap.entries()]
      .map(([area, counts]) => ({
        area,
        areaLabel: AREA_LABELS[area] ?? area,
        ...counts,
      }))
      .sort((a, b) => b.active - a.active);

    return {
      last24h: {
        enriched: enrichedCount,
        skipped: skippedCount,
        failed: failedCount,
        pending: pendingCount,
        approvalRate,
      },
      byArea,
      crawlerDiscarded24h,
      portalByArea,
      pendingEnrichment,
    };
  }

  async getAlerts() {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const [pausedSources, sourcesWith403, dashboard, failedJobsToday] =
      await Promise.all([
        this.database.jobSource.count({
          where: { pausedUntil: { gt: now } },
        }),
        this.database.jobSource.count({
          where: { consecutive403Count: { gt: 0 }, pausedUntil: null },
        }),
        this.ingestionService.getDashboard(),
        this.database.ingestionJobRun.count({
          where: { status: "FAILED", createdAt: { gte: todayStart } },
        }),
      ]);

    return {
      pausedSources,
      sourcesWith403,
      driftSources: dashboard.driftSources.length,
      failedJobsToday,
    };
  }
}
