import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  IngestionRun,
  IngestionRunStatus,
  JobSource,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { buildPublicJobSlug } from "../jobs/public-job-view";
import {
  AshbyAdapter,
  CustomApiAdapter,
  CustomHtmlAdapter,
  GreenhouseAdapter,
  GupyAdapter,
  InHireAdapter,
  LeverAdapter,
  TalentbrewAdapter,
  TeamtailorAdapter,
  WorkdayAdapter,
} from "./adapters";
import { evaluate403CircuitBreaker } from "./circuit-breaker-policy";
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
// mais tempo que isso e tratado como orfao.
const STALE_RUN_THRESHOLD_MS = 20 * 60_000;

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
        staleMarkedCount = await this.markSourceJobsAsInactiveWhenStale(
          jobSource.id,
          new Date(),
        );
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

  private createCollectContext(ingestionRunId: string): IngestionCollectContext {
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

  async listRuns(jobSourceId: string) {
    await this.assertJobSourceExists(jobSourceId);

    const runs = await this.database.ingestionRun.findMany({
      where: { jobSourceId },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    });

    return runs.map((run: IngestionRun) =>
      toRunSummary(run as IngestionRunRecord),
    );
  }

  async listAllRuns() {
    const runs = await this.database.ingestionRun.findMany({
      include: {
        jobSource: {
          select: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
            sourceName: true,
          },
        },
      },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    });

    return runs.map((run: IngestionRun) =>
      toRunSummary(run as IngestionRunRecord),
    );
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

  async getDashboard() {
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [allSources, runs24h, runningNow, staleJobsCount] = await Promise.all(
      [
        this.database.jobSource.findMany({
          include: { company: { select: { name: true } } },
        }),
        this.database.ingestionRun.findMany({
          where: { startedAt: { gte: cutoff24h } },
          select: {
            id: true,
            status: true,
            newCount: true,
            skippedCount: true,
          },
        }),
        this.database.ingestionRun.count({ where: { status: "running" } }),
        this.database.job.count({
          where: { status: "inactive", updatedAt: { gte: cutoff24h } },
        }),
      ],
    );

    const pausedSources = allSources
      .filter((s) => s.pausedUntil && s.pausedUntil > now)
      .map((s) => ({
        id: s.id,
        sourceName: s.sourceName,
        companyName: s.company.name,
        pausedUntil: s.pausedUntil?.toISOString(),
        pauseReason: s.pauseReason,
        consecutive403Count: s.consecutive403Count,
      }));

    const sources403 = allSources
      .filter(
        (s) =>
          s.consecutive403Count > 0 && (!s.pausedUntil || s.pausedUntil <= now),
      )
      .map((s) => ({
        id: s.id,
        sourceName: s.sourceName,
        companyName: s.company.name,
        consecutive403Count: s.consecutive403Count,
        lastErrorAt: s.lastErrorAt?.toISOString() ?? null,
        lastErrorMessage: s.lastErrorMessage,
      }));

    const recentJobs = await this.database.job.findMany({
      where: { lastSeenAt: { gt: cutoff24h } },
      select: { jobSourceId: true, descriptionClean: true },
    });

    const sourceInfoMap = new Map(
      allSources.map((s) => [
        s.id,
        { sourceName: s.sourceName, companyName: s.company.name },
      ]),
    );
    const driftMap = new Map<string, { total: number; withoutDesc: number }>();
    for (const job of recentJobs) {
      const entry = driftMap.get(job.jobSourceId) ?? {
        total: 0,
        withoutDesc: 0,
      };
      entry.total += 1;
      if (!job.descriptionClean || job.descriptionClean.trim() === "") {
        entry.withoutDesc += 1;
      }
      driftMap.set(job.jobSourceId, entry);
    }
    const driftSources = [...driftMap.entries()]
      .filter(([, d]) => d.total > 0 && d.withoutDesc / d.total > 0.5)
      .map(([sourceId, d]) => ({
        id: sourceId,
        ...(sourceInfoMap.get(sourceId) ?? {
          sourceName: sourceId,
          companyName: "",
        }),
        total: d.total,
        withoutDesc: d.withoutDesc,
        pctWithoutDesc: Math.round((d.withoutDesc / d.total) * 100),
      }));

    const newJobs24h = runs24h.reduce((sum, r) => sum + r.newCount, 0);
    const dedupSkipped24h = runs24h.reduce((sum, r) => sum + r.skippedCount, 0);

    return {
      pausedSources,
      sources403,
      driftSources,
      summary24h: {
        totalRuns: runs24h.length,
        runningNow,
        newJobs: newJobs24h,
        staleJobs: staleJobsCount,
        dedupSkipped: dedupSkipped24h,
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
    observation: NormalizedJobObservation,
  ) {
    const existingJob = await this.database.job.findUnique({
      where: { canonicalKey: observation.canonicalKey },
    });
    const normalizedSourceJobUrl = normalizeUrl(observation.sourceJobUrl);
    const firstSeenAt =
      existingJob?.firstSeenAt ?? new Date(observation.firstSeenAt);
    const nextLastSeenAt = new Date(observation.lastSeenAt);

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

    const payload = {
      city: observation.city,
      companyId: jobSource.company.id,
      country: observation.country,
      descriptionClean: observation.descriptionClean,
      descriptionRaw: observation.descriptionRaw,
      employmentType: observation.employmentType,
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
      status: observation.status ?? "active",
      title: observation.title,
      workModel: observation.workModel,
    };

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
      data: payload,
    });

    return {
      previewItem: {
        action: "updated",
        canonicalKey: observation.canonicalKey,
        message: "Updated existing job with latest observation.",
        title: observation.title,
      } satisfies IngestionPreviewItem,
    };
  }

  private async markSourceJobsAsInactiveWhenStale(
    jobSourceId: string,
    now: Date,
  ) {
    const cutoff = getStaleCutoff(now);
    const result = await this.database.job.updateMany({
      where: {
        jobSourceId,
        status: "active",
        lastSeenAt: { lt: cutoff },
      },
      data: {
        status: "inactive",
      },
    });

    return result.count;
  }
}
