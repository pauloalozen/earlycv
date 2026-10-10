import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type {
  IngestionRun,
  IngestionRunStatus,
  JobSource,
  Prisma,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { classifyJobLocation } from "../jobs/geo-normalizer";
import { JobLifecycleService } from "../jobs/job-lifecycle.service";
import { buildPublicJobSlug } from "../jobs/public-job-view";
import { WebRevalidationService } from "../web-revalidation/web-revalidation.service";
import {
  AshbyAdapter,
  CustomApiAdapter,
  CustomHtmlAdapter,
  EightfoldAdapter,
  GreenhouseAdapter,
  GupyAdapter,
  InHireAdapter,
  LeverAdapter,
  PandapeAdapter,
  SolidesAdapter,
  TalentbrewAdapter,
  TeamtailorAdapter,
  WorkdayAdapter,
} from "./adapters";
import { evaluate403CircuitBreaker } from "./circuit-breaker-policy";
import { withCleanTitle } from "./clean-title";
import { resolveEmploymentType } from "./employment-type";
import { isForbiddenIngestionError } from "./errors";
import { getStaleCutoff } from "./stale-policy";
import type {
  IngestionCollectContext,
  IngestionPreviewItem,
  IngestionRunSummary,
  IngestionSourceAdapter,
  JobSourceContext,
  NormalizedJobObservation,
} from "./types";

type IngestionRunRecord = IngestionRun & {
  jobSource?: {
    company: {
      id: string;
      name: string;
    };
    sourceName: string;
  };
  previewJson: IngestionPreviewItem[] | null;
};

// runJobSource cria o IngestionRun com status "running" e so o fecha
// (completed/failed) no fim do try/catch. Se o processo morrer no meio
// disso (restart do nest --watch em dev, deploy, OOM em prod) o run fica
// preso em "running" pra sempre — e como o findFirst({status:"running"})
// no topo de runJobSource bloqueia nova execucao pra aquela fonte, a fonte
// fica travada ate alguem mexer no banco na mao. Qualquer run "running" ha
// mais tempo que isso e tratado como orfao. Precisa ficar >= ITEM_LOCK_TTL_MS
// (ingestion-manual-runner.service.ts) — senao um run legitimo mas lento
// (Workday com pacing por vaga ja passou de 23min num caso real) e marcado
// como orfao por essa checagem antes mesmo do item-lock expirar.
const STALE_RUN_THRESHOLD_MS = 30 * 60_000;

function normalizeUrl(rawUrl: string) {
  const url = new URL(rawUrl.trim());

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.hostname = url.hostname.toLowerCase();

  return url.toString();
}

function toRunSummary(run: IngestionRunRecord): IngestionRunSummary {
  return {
    errorSummary: run.errorSummary ?? null,
    failedCount: run.failedCount,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    id: run.id,
    ...(run.jobSource
      ? {
          companyId: run.jobSource.company.id,
          companyName: run.jobSource.company.name,
          sourceName: run.jobSource.sourceName,
        }
      : {}),
    jobSourceId: run.jobSourceId,
    newCount: run.newCount,
    previewItems: run.previewJson ?? [],
    skippedCount: run.skippedCount,
    startedAt: run.startedAt.toISOString(),
    status: run.status,
    updatedCount: run.updatedCount,
  };
}

const DASHBOARD_LIST_LIMIT = 50;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly adapters: ReadonlyMap<
    JobSource["sourceType"],
    IngestionSourceAdapter
  >;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CustomHtmlAdapter) customHtmlAdapter: CustomHtmlAdapter,
    @Inject(CustomApiAdapter) customApiAdapter: CustomApiAdapter,
    @Inject(GupyAdapter) gupyAdapter: GupyAdapter,
    @Inject(GreenhouseAdapter) greenhouseAdapter: GreenhouseAdapter,
    @Inject(LeverAdapter) leverAdapter: LeverAdapter,
    @Inject(AshbyAdapter) ashbyAdapter: AshbyAdapter,
    @Inject(InHireAdapter) inHireAdapter: InHireAdapter,
    @Inject(TeamtailorAdapter) teamtailorAdapter: TeamtailorAdapter,
    @Inject(TalentbrewAdapter) talentbrewAdapter: TalentbrewAdapter,
    @Inject(WorkdayAdapter) workdayAdapter: WorkdayAdapter,
    @Inject(PandapeAdapter) pandapeAdapter: PandapeAdapter,
    @Inject(EightfoldAdapter) eightfoldAdapter: EightfoldAdapter,
    @Inject(SolidesAdapter) solidesAdapter: SolidesAdapter,
    @Inject(JobLifecycleService)
    private readonly jobLifecycle: JobLifecycleService,
    // Opcional e por último: cache do front (ISR do detalhe da vaga). Nunca
    // lança nem bloqueia — ver WebRevalidationService.
    @Optional()
    @Inject(WebRevalidationService)
    private readonly webRevalidation?: WebRevalidationService,
  ) {
    this.adapters = new Map<JobSource["sourceType"], IngestionSourceAdapter>([
      [customHtmlAdapter.sourceType, customHtmlAdapter],
      [customApiAdapter.sourceType, customApiAdapter],
      [gupyAdapter.sourceType, gupyAdapter],
      [greenhouseAdapter.sourceType, greenhouseAdapter],
      [leverAdapter.sourceType, leverAdapter],
      [ashbyAdapter.sourceType, ashbyAdapter],
      [inHireAdapter.sourceType, inHireAdapter],
      [teamtailorAdapter.sourceType, teamtailorAdapter],
      [talentbrewAdapter.sourceType, talentbrewAdapter],
      [workdayAdapter.sourceType, workdayAdapter],
      [pandapeAdapter.sourceType, pandapeAdapter],
      [eightfoldAdapter.sourceType, eightfoldAdapter],
      [solidesAdapter.sourceType, solidesAdapter],
    ]);
  }

  async recoverStaleRuns() {
    const staleThreshold = new Date(Date.now() - STALE_RUN_THRESHOLD_MS);
    const stuck = await this.database.ingestionRun.findMany({
      where: { status: "running" },
    });

    let recovered = 0;
    for (const run of stuck) {
      if (run.startedAt >= staleThreshold) continue;

      this.logger.warn(
        `ingestion run ${run.id} (source ${run.jobSourceId}) recovered from stale "running"`,
      );

      await this.database.ingestionRun.update({
        where: { id: run.id },
        data: {
          errorSummary:
            "stale run recuperado pelo scheduler (processo provavelmente reiniciado durante a ingestao)",
          failedCount: run.failedCount || 1,
          finishedAt: new Date(),
          status: "failed",
        },
      });
      recovered += 1;
    }

    return recovered;
  }

  async runJobSource(jobSourceId: string) {
    const jobSource = await this.getJobSourceContext(jobSourceId);
    this.assertJobSourceNotPaused(jobSource);
    await this.recoverStaleRuns();
    const runningRun = await this.database.ingestionRun.findFirst({
      where: {
        jobSourceId,
        status: "running",
      },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    });

    if (runningRun) {
      throw new ConflictException(
        "ingestion run already in progress for this source",
      );
    }

    const run = await this.database.ingestionRun.create({
      data: {
        jobSourceId,
        status: "running",
      },
    });

    try {
      const observations = await this.getAdapter(jobSource.sourceType).collect(
        jobSource,
        this.createCollectContext(run.id),
      );
      const previewItems: IngestionPreviewItem[] = [];
      let newCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let staleMarkedCount = 0;
      let detailFetchSkippedCount = 0;

      for (const observation of observations) {
        try {
          const result = await this.upsertObservation(jobSource, observation);
          previewItems.push(result.previewItem);
          if (observation.detailFetchSkipped) {
            detailFetchSkippedCount += 1;
          }

          if (result.previewItem.action === "created") {
            newCount += 1;
          } else if (result.previewItem.action === "updated") {
            updatedCount += 1;
          } else {
            skippedCount += 1;
          }
        } catch (error) {
          failedCount += 1;
          previewItems.push({
            action: "failed",
            canonicalKey: observation.canonicalKey,
            message:
              error instanceof Error ? error.message : "ingestion failed",
            title: observation.title,
          });
        }
      }

      const status: IngestionRunStatus =
        failedCount > 0 ? "failed" : "completed";

      if (failedCount === 0) {
        staleMarkedCount = await this.markSourceJobsAsInactiveWhenStale({
          jobSourceId: jobSource.id,
          now: new Date(),
          observationCount: observations.length,
          runId: run.id,
          runStartedAt: run.startedAt,
        });
      }

      const circuitState = evaluate403CircuitBreaker({
        event: "success",
        now: new Date(),
        previousConsecutive403Count: jobSource.consecutive403Count,
        previousPauseReason: jobSource.pauseReason,
        previousPausedUntil: jobSource.pausedUntil,
      });

      const updatedRun = await this.database.ingestionRun.update({
        where: { id: run.id },
        data: {
          errorSummary:
            failedCount > 0
              ? `${failedCount} item(s) failed during ingestion.`
              : null,
          failedCount,
          finishedAt: new Date(),
          newCount,
          previewJson: previewItems,
          skippedCount,
          status,
          updatedCount,
        },
      });

      await this.database.jobSource.update({
        where: { id: jobSource.id },
        data: {
          lastCheckedAt: new Date(),
          lastErrorAt: failedCount > 0 ? new Date() : null,
          lastErrorMessage:
            failedCount > 0
              ? `${failedCount} item(s) failed during ingestion.`
              : null,
          lastSuccessAt: new Date(),
          consecutive403Count: circuitState.consecutive403Count,
          pausedUntil: circuitState.pausedUntil,
          pauseReason: circuitState.pauseReason,
        },
      });

      return {
        ...toRunSummary(updatedRun as IngestionRunRecord),
        currentConsecutive403: circuitState.consecutive403Count,
        pauseTriggered: circuitState.pauseTriggered,
        detailFetchSkippedCount,
        staleMarkedCount,
      };
    } catch (error) {
      const circuitState = evaluate403CircuitBreaker({
        event: isForbiddenIngestionError(error) ? "error_403" : "error_other",
        now: new Date(),
        previousConsecutive403Count: jobSource.consecutive403Count,
        previousPauseReason: jobSource.pauseReason,
        previousPausedUntil: jobSource.pausedUntil,
      });

      const failedRun = await this.database.ingestionRun.update({
        where: { id: run.id },
        data: {
          errorSummary:
            error instanceof Error ? error.message : "ingestion failed",
          failedCount: 1,
          finishedAt: new Date(),
          previewJson: [],
          status: "failed",
        },
      });

      await this.database.jobSource.update({
        where: { id: jobSource.id },
        data: {
          lastCheckedAt: new Date(),
          lastErrorAt: new Date(),
          lastErrorMessage:
            error instanceof Error ? error.message : "ingestion failed",
          consecutive403Count: circuitState.consecutive403Count,
          pausedUntil: circuitState.pausedUntil,
          pauseReason: circuitState.pauseReason,
        },
      });

      return {
        ...toRunSummary(failedRun as IngestionRunRecord),
        currentConsecutive403: circuitState.consecutive403Count,
        pauseTriggered: circuitState.pauseTriggered,
      };
    }
  }

  private createCollectContext(
    ingestionRunId: string,
  ): IngestionCollectContext {
    return {
      getExistingJobByCanonicalKey: async (canonicalKey: string) => {
        return this.database.job.findUnique({
          where: { canonicalKey },
          select: { lastSeenAt: true },
        });
      },
      ingestionRunId,
    };
  }

  // Historico de runs de UMA fonte, paginado no banco e sem previewJson —
  // antes trazia todas as runs da fonte com o blob de preview, o que fazia o
  // engine do Prisma alocar centenas de MB nativos que o glibc nao devolvia.
  // O preview so e lido no detalhe de um run (getRun).
  async listRuns(
    jobSourceId: string,
    filters: { page?: number; limit?: number } = {},
  ) {
    await this.assertJobSourceExists(jobSourceId);

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 25;
    const where = { jobSourceId };

    const [runs, total] = await Promise.all([
      this.database.ingestionRun.findMany({
        orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
        omit: { previewJson: true },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.database.ingestionRun.count({ where }),
    ]);

    return {
      limit,
      page,
      runs: runs.map((run) =>
        toRunSummary({ ...run, previewJson: null } as IngestionRunRecord),
      ),
      total,
    };
  }

  async listAllRuns(filters: {
    page?: number;
    limit?: number;
    query?: string;
    status?: IngestionRunStatus;
  }) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 25;

    const where: Prisma.IngestionRunWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.query
        ? {
            OR: [
              { id: { contains: filters.query, mode: "insensitive" } },
              {
                jobSource: {
                  sourceName: { contains: filters.query, mode: "insensitive" },
                },
              },
              {
                jobSource: {
                  company: {
                    name: { contains: filters.query, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
    };

    // previewJson (o blob de items previstos por run) e propositalmente
    // deixado de fora daqui — so o detalhe de UM run (getRun/getRunById)
    // precisa dele. Incluir isso pra toda a lista, sem paginacao, e o que
    // deixava a tela admin lenta a medida que o historico de runs crescia.
    const select = {
      errorSummary: true,
      failedCount: true,
      finishedAt: true,
      id: true,
      jobSource: {
        select: {
          company: { select: { id: true, name: true } },
          sourceName: true,
        },
      },
      jobSourceId: true,
      newCount: true,
      skippedCount: true,
      startedAt: true,
      status: true,
      updatedCount: true,
    } as const;

    const [runs, total] = await Promise.all([
      this.database.ingestionRun.findMany({
        orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
        select,
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.database.ingestionRun.count({ where }),
    ]);

    return {
      limit,
      page,
      runs: runs.map((run) =>
        toRunSummary({ ...run, previewJson: null } as IngestionRunRecord),
      ),
      total,
    };
  }

  async getRunById(runId: string) {
    const run = await this.database.ingestionRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException("ingestion run not found");
    }

    return toRunSummary(run as IngestionRunRecord);
  }

  async getRun(jobSourceId: string, runId: string) {
    const run = await this.database.ingestionRun.findFirst({
      where: { id: runId, jobSourceId },
    });

    if (!run) {
      throw new NotFoundException("ingestion run not found");
    }

    const summary = toRunSummary(run as IngestionRunRecord);
    const discardedByFilterCount =
      await this.database.crawlerDiscardedTitle.count({
        where: { ingestionRunId: run.id },
      });

    return {
      ...summary,
      discardedByFilterCount,
      previewItems: await this.attachEnrichmentToPreviewItems(
        summary.previewItems,
      ),
    };
  }

  // Job.canonicalKey e globalmente unico (gupy:subdominio:id externo), entao
  // da pra resolver qual Job cada item do preview virou sem precisar de uma
  // coluna de associacao run->job dedicada.
  private async attachEnrichmentToPreviewItems(
    items: IngestionPreviewItem[],
  ): Promise<IngestionPreviewItem[]> {
    if (items.length === 0) {
      return items;
    }

    const canonicalKeys = items.map((item) => item.canonicalKey);
    const jobs = await this.database.job.findMany({
      where: { canonicalKey: { in: canonicalKeys } },
      select: {
        canonicalKey: true,
        enrichment: {
          select: {
            careerFingerprint: true,
            dominantArea: true,
            enrichmentStatus: true,
            id: true,
            semanticFilterReason: true,
          },
        },
      },
    });

    const enrichmentByCanonicalKey = new Map(
      jobs.map((job) => [job.canonicalKey, job.enrichment]),
    );

    return items.map((item) => ({
      ...item,
      enrichment: enrichmentByCanonicalKey.get(item.canonicalKey) ?? null,
    }));
  }

  // Resumo de enriquecimento das vagas NOVAS de uma run (action "created" no
  // preview) — vagas so "updated"/"skipped"/"failed" nao disparam
  // JobEnrichment novo nesta run, entao ficam fora da contagem.
  async getRunEnrichmentSummary(runId: string) {
    const run = await this.database.ingestionRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException("ingestion run not found");
    }

    const createdCanonicalKeys = (
      (run.previewJson as IngestionPreviewItem[] | null) ?? []
    )
      .filter((item) => item.action === "created")
      .map((item) => item.canonicalKey);

    if (createdCanonicalKeys.length === 0) {
      return { completed: 0, failed: 0, pending: 0, skipped: 0, total: 0 };
    }

    const jobs = await this.database.job.findMany({
      where: { canonicalKey: { in: createdCanonicalKeys } },
      select: { id: true },
    });
    const jobIds = jobs.map((job) => job.id);

    const grouped = await this.database.jobEnrichment.groupBy({
      by: ["enrichmentStatus"],
      where: { jobId: { in: jobIds } },
      _count: { _all: true },
    });

    let completed = 0;
    let skipped = 0;
    let failed = 0;
    // PENDING e PROCESSING contam juntos como "pendente" — nao ha slot
    // separado pra PROCESSING no resumo (Parte 2.3 da spec).
    let pending = 0;

    for (const group of grouped) {
      const count = group._count._all;
      if (group.enrichmentStatus === "COMPLETED") completed += count;
      else if (group.enrichmentStatus === "SKIPPED") skipped += count;
      else if (group.enrichmentStatus === "FAILED") failed += count;
      else pending += count;
    }

    // Jobs criados nesta run sem nenhum JobEnrichment (falha silenciosa na
    // criacao do trigger) tambem contam como pendentes, pra completed +
    // skipped + pending + failed sempre somar total.
    const accounted = completed + skipped + failed + pending;
    pending += Math.max(0, jobIds.length - accounted);

    return { completed, failed, pending, skipped, total: jobIds.length };
  }

  // Painel leve da aba Fontes: tudo agregado no banco, nunca carrega vagas
  // nem a tabela inteira de fontes. As listas expansiveis sao limitadas a
  // DASHBOARD_LIST_LIMIT itens; os totais reais vao em *Total.
  async getDashboard() {
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const pausedWhere = { pausedUntil: { gt: now } };
    const forbiddenWhere = {
      consecutive403Count: { gt: 0 },
      OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
    };
    const sourceSelect = {
      id: true,
      sourceName: true,
      company: { select: { name: true } },
    } as const;

    const [
      pausedTotal,
      pausedRows,
      forbiddenTotal,
      forbiddenRows,
      driftRows,
      runsAggregate,
      runningNow,
      staleJobsCount,
    ] = await Promise.all([
      this.database.jobSource.count({ where: pausedWhere }),
      this.database.jobSource.findMany({
        where: pausedWhere,
        select: {
          ...sourceSelect,
          pausedUntil: true,
          pauseReason: true,
          consecutive403Count: true,
        },
        orderBy: { pausedUntil: "asc" },
        take: DASHBOARD_LIST_LIMIT,
      }),
      this.database.jobSource.count({ where: forbiddenWhere }),
      this.database.jobSource.findMany({
        where: forbiddenWhere,
        select: {
          ...sourceSelect,
          consecutive403Count: true,
          lastErrorAt: true,
          lastErrorMessage: true,
        },
        orderBy: { consecutive403Count: "desc" },
        take: DASHBOARD_LIST_LIMIT,
      }),
      // Drift: fontes em que mais da metade das vagas vistas nas ultimas 24h
      // esta sem descricao. Agrega no banco (nao traz descriptionClean).
      this.database.$queryRaw<
        Array<{
          jobSourceId: string;
          sourceName: string;
          companyName: string;
          total: number;
          withoutDesc: number;
          driftTotal: number;
        }>
      >`
        WITH drift AS (
          SELECT j."jobSourceId",
                 count(*)::int AS total,
                 (count(*) FILTER (
                   WHERE j."descriptionClean" IS NULL
                      OR btrim(j."descriptionClean") = ''
                 ))::int AS "withoutDesc"
          FROM "Job" j
          WHERE j."lastSeenAt" > ${cutoff24h} AND j."jobSourceId" IS NOT NULL
          GROUP BY j."jobSourceId"
          HAVING (count(*) FILTER (
                   WHERE j."descriptionClean" IS NULL
                      OR btrim(j."descriptionClean") = ''
                 )) * 2 > count(*)
        )
        SELECT d."jobSourceId", s."sourceName", c."name" AS "companyName",
               d.total, d."withoutDesc",
               (count(*) OVER ())::int AS "driftTotal"
        FROM drift d
        JOIN "JobSource" s ON s.id = d."jobSourceId"
        JOIN "Company" c ON c.id = s."companyId"
        ORDER BY d."withoutDesc" DESC
        LIMIT ${DASHBOARD_LIST_LIMIT}
      `,
      this.database.ingestionRun.aggregate({
        where: { startedAt: { gte: cutoff24h } },
        _count: { _all: true },
        _sum: { newCount: true, skippedCount: true },
      }),
      this.database.ingestionRun.count({ where: { status: "running" } }),
      this.database.job.count({
        where: { status: "inactive", updatedAt: { gte: cutoff24h } },
      }),
    ]);

    return {
      pausedTotal,
      pausedSources: pausedRows.map((s) => ({
        id: s.id,
        sourceName: s.sourceName,
        companyName: s.company.name,
        pausedUntil: s.pausedUntil?.toISOString(),
        pauseReason: s.pauseReason,
        consecutive403Count: s.consecutive403Count,
      })),
      sources403Total: forbiddenTotal,
      sources403: forbiddenRows.map((s) => ({
        id: s.id,
        sourceName: s.sourceName,
        companyName: s.company.name,
        consecutive403Count: s.consecutive403Count,
        lastErrorAt: s.lastErrorAt?.toISOString() ?? null,
        lastErrorMessage: s.lastErrorMessage,
      })),
      driftTotal: driftRows[0]?.driftTotal ?? 0,
      driftSources: driftRows.map((d) => ({
        id: d.jobSourceId,
        sourceName: d.sourceName,
        companyName: d.companyName,
        total: d.total,
        withoutDesc: d.withoutDesc,
        pctWithoutDesc: Math.round((d.withoutDesc / d.total) * 100),
      })),
      summary24h: {
        totalRuns: runsAggregate._count._all,
        runningNow,
        newJobs: runsAggregate._sum.newCount ?? 0,
        staleJobs: staleJobsCount,
        dedupSkipped: runsAggregate._sum.skippedCount ?? 0,
      },
    };
  }

  private async assertJobSourceExists(jobSourceId: string) {
    const jobSource = await this.database.jobSource.findUnique({
      where: { id: jobSourceId },
      select: { id: true },
    });

    if (!jobSource) {
      throw new NotFoundException("job source not found");
    }
  }

  private async getJobSourceContext(jobSourceId: string) {
    const jobSource = await this.database.jobSource.findUnique({
      where: { id: jobSourceId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            normalizedName: true,
          },
        },
      },
    });

    if (!jobSource) {
      throw new NotFoundException("job source not found");
    }

    return jobSource as JobSourceContext;
  }

  private getAdapter(sourceType: JobSource["sourceType"]) {
    const adapter = this.adapters.get(sourceType);

    if (!adapter) {
      throw new BadRequestException(
        `manual ingestion is not supported for source type ${sourceType}`,
      );
    }

    return adapter;
  }

  // Usado pela Descoberta de Empresas pra validar um candidato (nome +
  // URL/adapter chutados) antes de virar Company+JobSource de verdade —
  // roda o adapter real de producao (mesmo collect() de um crawl normal)
  // contra um JobSourceContext sintetico, sem persistir nada. Um candidato
  // sem adapter implementado (kenoby/successfactors/lgcloud) so
  // retorna "sem adapter", nao lanca.
  async probeSource(
    sourceType: JobSource["sourceType"],
    sourceUrl: string,
  ): Promise<{
    error?: string;
    inconclusive: boolean;
    jobCount: number;
    ok: boolean;
    // Total de vagas no board antes do filtro semantico de tech — permite
    // distinguir "board vazio" de "board tem vagas, nenhuma de tech".
    rawJobCount: number;
  }> {
    const adapter = this.adapters.get(sourceType);
    if (!adapter) {
      return {
        error: `no adapter implemented for ${sourceType}`,
        inconclusive: false,
        jobCount: 0,
        ok: false,
        rawJobCount: 0,
      };
    }

    let semanticFilterSkips = 0;
    const probeCollectContext: IngestionCollectContext = {
      getExistingJobByCanonicalKey: async () => null,
      onSemanticFilterSkip: () => {
        semanticFilterSkips += 1;
      },
    };

    const syntheticContext: JobSourceContext = {
      checkIntervalMinutes: 30,
      companyId: "discovery-probe",
      consecutive403Count: 0,
      crawlStrategy: "api",
      id: "discovery-probe",
      parserKey: sourceType,
      pauseReason: null,
      pausedUntil: null,
      sourceName: "discovery probe",
      sourceType,
      sourceUrl,
      company: {
        id: "discovery-probe",
        name: "Discovery Probe",
        normalizedName: "discovery-probe",
      },
    };

    try {
      const observations = await adapter.collect(
        syntheticContext,
        probeCollectContext,
      );
      return {
        inconclusive: false,
        jobCount: observations.length,
        ok: true,
        rawJobCount: observations.length + semanticFilterSkips,
      };
    } catch (error) {
      // 403 (anti-bot) e timeout nao provam que o slug/URL esta errado —
      // so que a tentativa falhou dessa vez. Erro estrutural (URL nao
      // resolve, 404, parse quebrado) e o sinal real de "nao existe".
      const inconclusive =
        isForbiddenIngestionError(error) ||
        (error instanceof Error &&
          (error.name === "TimeoutError" ||
            error.name === "AbortError" ||
            /timeout/i.test(error.message)));
      return {
        error: error instanceof Error ? error.message : "probe failed",
        inconclusive,
        jobCount: 0,
        ok: false,
        rawJobCount: 0,
      };
    }
  }

  private assertJobSourceNotPaused(jobSource: JobSourceContext) {
    if (!jobSource.pausedUntil) {
      return;
    }

    const now = new Date();
    if (jobSource.pausedUntil <= now) {
      return;
    }

    const pauseReason = jobSource.pauseReason ?? "source paused";
    throw new ConflictException(
      `job source is paused until ${jobSource.pausedUntil.toISOString()} (${pauseReason})`,
    );
  }

  // O sufixo cuid do Job.id já torna buildPublicJobSlug globalmente único na
  // prática (dois Jobs nunca compartilham id) — este loop é uma rede de
  // segurança caso a estratégia de geração de id mude no futuro, não um
  // caminho esperado em produção.
  private async buildUniqueJobSlug(id: string, title: string, company: string) {
    const base = buildPublicJobSlug(id, title, company);
    let candidate = base;
    let suffix = 2;

    while (
      await this.database.job.findUnique({
        where: { slug: candidate },
        select: { id: true },
      })
    ) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private async upsertObservation(
    jobSource: JobSourceContext,
    rawObservation: NormalizedJobObservation,
  ) {
    const observation = withCleanTitle(rawObservation);
    // Vagas de boards globais (Workday/Greenhouse/Ashby de empresas com
    // operação Brasil, mas board único mundial) trazem vaga de qualquer
    // país junto com as brasileiras. classifyJobLocation() usa o country
    // real da fonte (sem o fallback "Brasil" que os adapters aplicavam
    // antes — ver comentário em cada adapter), o state, a cidade e o
    // locationText. Estrangeira: rejeitada aqui, a vaga nunca chega a ser
    // criada/atualizada — não tem Job nem JobEnrichment, então nunca aparece
    // pro público.
    const locationClass = classifyJobLocation({
      city: observation.city,
      country: observation.country,
      isGlobalBoard: jobSource.isGlobalBoard,
      locationText: observation.locationText,
      state: observation.state,
    });
    if (locationClass === "foreign") {
      return {
        previewItem: {
          action: "skipped",
          canonicalKey: observation.canonicalKey,
          message: `Skipped non-Brazilian job location (country=${observation.country ?? "null"}, state=${observation.state ?? "null"}, location=${observation.locationText ?? "null"}).`,
          title: observation.title,
        } satisfies IngestionPreviewItem,
      };
    }

    const existingJob = await this.database.job.findUnique({
      where: { canonicalKey: observation.canonicalKey },
    });

    // Só "Remote" vindo de board global: não dá pra saber se é do Brasil.
    // Vaga nova entra em pending_review (fora do radar até revisão no
    // admin); vaga já aprovada (reviewApprovedAt) segue normal; vaga
    // rejeitada (removed) não volta.
    const needsReview =
      locationClass === "review" && !existingJob?.reviewApprovedAt;
    if (needsReview && existingJob?.status === "removed") {
      return {
        previewItem: {
          action: "skipped",
          canonicalKey: observation.canonicalKey,
          message: "Skipped job rejected in location review.",
          title: observation.title,
        } satisfies IngestionPreviewItem,
      };
    }
    const normalizedSourceJobUrl = normalizeUrl(observation.sourceJobUrl);
    const firstSeenAt =
      existingJob?.firstSeenAt ?? new Date(observation.firstSeenAt);
    const nextLastSeenAt = new Date(observation.lastSeenAt);

    // Observação "leve" (detailFetchSkipped, ver shouldSkipDetailFetch em
    // dedup-policy.ts) só existe pra vaga que já foi vista com detalhe
    // completo antes — gupy/inhire/talentbrew/workday mandam ela só pra
    // manter lastSeenAt fresco sem gastar uma requisição cara de detalhe a
    // cada crawl, e por isso ela vem com descriptionClean/descriptionRaw/
    // locationText/etc degenerados (workday/inhire/talentbrew mandam
    // descriptionClean=title, descriptionRaw=""; gupy manda os dois vazios).
    // Sem essa guarda, todo recrawl "leve" — que é o caminho normal pra
    // maioria das vagas dessas fontes — apagava a descrição real já salva,
    // sem jeito de recuperar depois. Preserva os campos de detalhe da vaga
    // já existente e só atualiza o que uma observação leve sabe de verdade
    // (lastSeenAt/status/sourceJobUrl).
    const preserveDetailFields =
      observation.detailFetchSkipped === true && existingJob !== null;

    // contentUpdatedAt só avança quando título/descrição mudam de verdade —
    // diferente de lastSeenAt/updatedAt, que são bumped em toda observação
    // do crawler mesmo sem mudança real de conteúdo (usado como
    // lastModified do sitemap, ver jobs.service.ts#listSitemapData). Vaga
    // nova conta como "conteúdo mudou" (primeira versão publicada).
    // Observação leve nunca conta como mudança de conteúdo — ela não trouxe
    // nenhum conteúdo real pra comparar.
    const contentChanged =
      !existingJob ||
      (!preserveDetailFields &&
        (existingJob.title !== observation.title ||
          existingJob.descriptionClean !== observation.descriptionClean));

    if (existingJob && nextLastSeenAt < existingJob.lastSeenAt) {
      return {
        previewItem: {
          action: "skipped",
          canonicalKey: observation.canonicalKey,
          message: "Skipped stale observation with older lastSeenAt.",
          title: observation.title,
        } satisfies IngestionPreviewItem,
      };
    }

    const { employmentType, employmentTypeRaw } = resolveEmploymentType({
      employmentType: observation.employmentType,
      employmentTypeRaw: observation.employmentTypeRaw,
      title: observation.title,
    });

    const payload = {
      city: observation.city,
      companyId: jobSource.company.id,
      // Default aplicado só depois do filtro isForeignLocation() já ter
      // rodado (acima) — nesse ponto, um country vazio já foi confirmado
      // como "não é sinal de vaga estrangeira", então assumir Brasil aqui
      // é seguro.
      contentUpdatedAt: contentChanged ? new Date() : undefined,
      country: observation.country ?? "Brasil",
      descriptionClean: observation.descriptionClean,
      descriptionRaw: observation.descriptionRaw,
      employmentType,
      employmentTypeRaw,
      externalJobId: observation.externalJobId,
      firstSeenAt,
      jobSourceId: jobSource.id,
      lastSeenAt: nextLastSeenAt,
      locationText: observation.locationText,
      metadataJson: observation.department
        ? { department: observation.department }
        : undefined,
      normalizedTitle: observation.normalizedTitle,
      publishedAtSource: observation.publishedAtSource
        ? new Date(observation.publishedAtSource)
        : null,
      seniorityLevel: observation.seniorityLevel,
      sourceJobUrl: normalizedSourceJobUrl,
      state: observation.state,
      status: needsReview
        ? ("pending_review" as const)
        : (observation.status ?? "active"),
      title: observation.title,
      workModel: observation.workModel,
    };

    // Payload de fato usado no update — quando a observação é "leve"
    // (preserveDetailFields), sobrescreve os campos de detalhe com
    // `undefined` pra que o Prisma simplesmente não os toque, preservando o
    // que já está salvo. `payload` acima continua com tudo preenchido pro
    // create (vaga nova nunca chega com preserveDetailFields=true).
    const updateData = preserveDetailFields
      ? {
          ...payload,
          city: undefined,
          country: undefined,
          descriptionClean: undefined,
          descriptionRaw: undefined,
          employmentType: undefined,
          employmentTypeRaw: undefined,
          locationText: undefined,
          metadataJson: undefined,
          normalizedTitle: undefined,
          publishedAtSource: undefined,
          seniorityLevel: undefined,
          state: undefined,
          title: undefined,
          workModel: undefined,
        }
      : payload;

    if (!existingJob) {
      const createdJob = await this.database.job.create({
        data: {
          ...payload,
          canonicalKey: observation.canonicalKey,
        },
      });

      // Slug é calculado a partir do id só depois do create (o id é gerado
      // pelo Prisma na hora do insert). Fica fixo daqui pra frente — updates
      // subsequentes desta vaga (ver bloco abaixo) nunca recalculam o slug,
      // mesmo que o título mude na fonte, pra não quebrar URLs já indexadas.
      const slug = await this.buildUniqueJobSlug(
        createdJob.id,
        observation.title,
        jobSource.company.name,
      );
      await this.database.job.update({
        where: { id: createdJob.id },
        data: { slug },
      });

      // Enriquecimento roda em worker assincrono (JobEnrichmentWorker) e
      // nunca deve bloquear nem falhar a ingestao — a vaga ja esta salva e
      // visivel no admin independente do enriquecimento acontecer.
      try {
        await this.database.jobEnrichment.create({
          data: { jobId: createdJob.id },
        });
      } catch (error) {
        this.logger.warn(
          `failed to create JobEnrichment for job ${createdJob.id}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }

      return {
        previewItem: {
          action: "created",
          canonicalKey: observation.canonicalKey,
          message: "Created new job from manual ingestion.",
          title: observation.title,
        } satisfies IngestionPreviewItem,
      };
    }

    await this.database.job.update({
      where: { id: existingJob.id },
      data: updateData,
    });

    // Cache do front (ISR do detalhe): vaga que muda de status ou de
    // conteúdo. Só enfileira (não lança/bloqueia); o TTL cobre falhas.
    // Indexing API: mesma regra do JobLifecycle (saiu do radar -> DELETED,
    // voltou -> UPDATED).
    const nextStatus = payload.status;
    await this.jobLifecycle
      .onStatusChanged({
        from: existingJob.status,
        slug: existingJob.slug,
        to: nextStatus,
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `indexing enqueue failed for ${existingJob.slug ?? existingJob.id}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      });
    if (existingJob.status === "active" && nextStatus !== "active") {
      this.requestWebRevalidation(existingJob.slug, "inactivated");
    } else if (existingJob.status !== "active" && nextStatus === "active") {
      this.requestWebRevalidation(existingJob.slug, "published");
    } else if (existingJob.status === "active" && contentChanged) {
      this.requestWebRevalidation(existingJob.slug, "updated");
    }

    return {
      previewItem: {
        action: "updated",
        canonicalKey: observation.canonicalKey,
        message: "Updated existing job with latest observation.",
        title: observation.title,
      } satisfies IngestionPreviewItem,
    };
  }

  // Nunca deixa uma falha do cache do front interromper a ingestão: o serviço
  // já não lança, e aqui há uma segunda barreira. O TTL do ISR cobre o resto.
  private requestWebRevalidation(
    slug: string | null,
    reason: "updated" | "published" | "inactivated",
  ) {
    try {
      this.webRevalidation?.requestJobRevalidation(slug, reason);
    } catch (error) {
      this.logger.warn(
        `web revalidation request failed for ${slug ?? "job without slug"}: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  private async markSourceJobsAsInactiveWhenStale(input: {
    jobSourceId: string;
    now: Date;
    observationCount: number;
    runId: string;
    runStartedAt: Date;
  }) {
    const { jobSourceId, now, observationCount, runId, runStartedAt } = input;
    // Execução concluída imediatamente anterior a esta — regra de "2
    // execuções seguidas sem ver a vaga" (ver stale-policy.ts).
    const previousCompletedRun = await this.database.ingestionRun.findFirst({
      where: {
        id: { not: runId },
        jobSourceId,
        startedAt: { lt: runStartedAt },
        status: "completed",
      },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    const cutoff = getStaleCutoff({
      now,
      observationCount,
      previousCompletedRunStartedAt: previousCompletedRun?.startedAt ?? null,
    });
    const where = {
      jobSourceId,
      status: "active" as const,
      lastSeenAt: { lt: cutoff },
    };

    // JobLifecycle: muda o status, enfileira URL_DELETED de cada vaga que
    // estava no radar e pede a revalidação do cache do front.
    const { count } = await this.jobLifecycle.closeJobs({
      reason: "stale-source-jobs",
      status: "inactive",
      where,
    });

    return count;
  }
}
