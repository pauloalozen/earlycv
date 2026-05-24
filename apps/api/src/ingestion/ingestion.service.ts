import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  IngestionRun,
  IngestionRunStatus,
  JobSource,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { CustomApiAdapter, CustomHtmlAdapter, GupyAdapter } from "./adapters";
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
  private readonly adapters: ReadonlyMap<
    JobSource["sourceType"],
    IngestionSourceAdapter
  >;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CustomHtmlAdapter) customHtmlAdapter: CustomHtmlAdapter,
    @Inject(CustomApiAdapter) customApiAdapter: CustomApiAdapter,
    @Inject(GupyAdapter) gupyAdapter: GupyAdapter,
  ) {
    this.adapters = new Map<JobSource["sourceType"], IngestionSourceAdapter>([
      [customHtmlAdapter.sourceType, customHtmlAdapter],
      [customApiAdapter.sourceType, customApiAdapter],
      [gupyAdapter.sourceType, gupyAdapter],
    ]);
  }

  async runJobSource(jobSourceId: string) {
    const jobSource = await this.getJobSourceContext(jobSourceId);
    this.assertJobSourceNotPaused(jobSource);
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
        this.createCollectContext(),
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

  private createCollectContext(): IngestionCollectContext {
    return {
      getExistingJobByCanonicalKey: async (canonicalKey: string) => {
        return this.database.job.findUnique({
          where: { canonicalKey },
          select: { lastSeenAt: true },
        });
      },
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

    return toRunSummary(run as IngestionRunRecord);
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
        pausedUntil: s.pausedUntil!.toISOString(),
        pauseReason: s.pauseReason,
        consecutive403Count: s.consecutive403Count,
      }));

    const sources403 = allSources
      .filter(
        (s) =>
          s.consecutive403Count > 0 &&
          (!s.pausedUntil || s.pausedUntil <= now),
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
      await this.database.job.create({
        data: {
          ...payload,
          canonicalKey: observation.canonicalKey,
        },
      });

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
