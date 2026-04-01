import {
  BadRequestException,
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
import { CustomApiAdapter, CustomHtmlAdapter } from "./adapters";
import type {
  IngestionPreviewItem,
  IngestionRunSummary,
  IngestionSourceAdapter,
  JobSourceContext,
  NormalizedJobObservation,
} from "./types";

type IngestionRunRecord = IngestionRun & {
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
  ) {
    this.adapters = new Map<JobSource["sourceType"], IngestionSourceAdapter>([
      [customHtmlAdapter.sourceType, customHtmlAdapter],
      [customApiAdapter.sourceType, customApiAdapter],
    ]);
  }

  async runJobSource(jobSourceId: string) {
    const jobSource = await this.getJobSourceContext(jobSourceId);
    const run = await this.database.ingestionRun.create({
      data: {
        jobSourceId,
        status: "running",
      },
    });

    try {
      const observations = await this.getAdapter(jobSource.sourceType).collect(
        jobSource,
      );
      const previewItems: IngestionPreviewItem[] = [];
      let newCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (const observation of observations) {
        try {
          const result = await this.upsertObservation(jobSource, observation);
          previewItems.push(result.previewItem);

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
        },
      });

      return toRunSummary(updatedRun as IngestionRunRecord);
    } catch (error) {
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
        },
      });

      return toRunSummary(failedRun as IngestionRunRecord);
    }
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
}
