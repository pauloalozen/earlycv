import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type OpenAI from "openai";

import { getAiModel } from "../common/ai-client-factory";
import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "./ingestion-lock.repository";
import {
  enrichJobWithLlm,
  JOB_ENRICHMENT_PROMPT_VERSION,
  type JobEnrichmentLlmResult,
} from "./job-enrichment-llm";
import { SemanticFilterService } from "./semantic-filter.service";

export const JOB_ENRICHMENT_AI_CLIENT = "JOB_ENRICHMENT_AI_CLIENT";
export const JOB_ENRICHMENT_WORKER_OPTIONS = "JOB_ENRICHMENT_WORKER_OPTIONS";

const LOCK_ID = "job-enrichment-worker";
const LOCK_TTL_MS = 5 * 60_000;

type JobEnrichmentWorkerOptions = {
  batchSize?: number;
  enrich?: (input: {
    department: string | null;
    descriptionClean: string;
    title: string;
  }) => Promise<JobEnrichmentLlmResult>;
  maxAttempts?: number;
};

function getDepartmentFromMetadata(metadataJson: unknown): string | null {
  if (typeof metadataJson !== "object" || metadataJson === null) return null;
  const department = (metadataJson as Record<string, unknown>).department;
  return typeof department === "string" ? department : null;
}

@Injectable()
export class JobEnrichmentWorker {
  private readonly logger = new Logger(JobEnrichmentWorker.name);
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly enrich: (input: {
    department: string | null;
    descriptionClean: string;
    title: string;
  }) => Promise<JobEnrichmentLlmResult>;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SemanticFilterService)
    private readonly semanticFilterService: SemanticFilterService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
    @Optional()
    @Inject(JOB_ENRICHMENT_AI_CLIENT)
    aiClient?: OpenAI,
    @Optional()
    @Inject(JOB_ENRICHMENT_WORKER_OPTIONS)
    options: JobEnrichmentWorkerOptions = {},
  ) {
    this.batchSize =
      options.batchSize ?? Number(process.env.ENRICHMENT_BATCH_SIZE || 10);
    this.maxAttempts = options.maxAttempts ?? 3;
    this.enrich =
      options.enrich ??
      ((input) => {
        if (!aiClient) {
          throw new Error("JOB_ENRICHMENT_AI_CLIENT is not configured");
        }
        return enrichJobWithLlm(aiClient, getAiModel("JOB_ENRICHMENT"), input);
      });
  }

  @Cron(process.env.ENRICHMENT_CRON_EXPRESSION || "*/10 * * * * *")
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    await this.processPendingBatch();
  }

  async processPendingBatch() {
    const owner = `job-enrichment-worker-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );

    if (!acquired) {
      return;
    }

    try {
      const pending = await this.database.jobEnrichment.findMany({
        where: { enrichmentStatus: "PENDING" },
        orderBy: [{ createdAt: "asc" }],
        take: this.batchSize,
        include: {
          job: {
            select: {
              descriptionClean: true,
              metadataJson: true,
              normalizedTitle: true,
              title: true,
            },
          },
        },
      });

      for (const enrichment of pending) {
        await this.processItem(enrichment);
      }
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  private async processItem(enrichment: {
    attempts: number;
    id: string;
    job: {
      descriptionClean: string;
      metadataJson: unknown;
      normalizedTitle: string;
      title: string;
    };
  }) {
    await this.database.jobEnrichment.update({
      where: { id: enrichment.id },
      data: { enrichmentStatus: "PROCESSING" },
    });

    let decision: Awaited<ReturnType<SemanticFilterService["evaluate"]>>;
    try {
      decision = await this.semanticFilterService.evaluate(
        enrichment.job.normalizedTitle,
      );
    } catch (error) {
      this.logger.error(
        `semantic filter failed for job enrichment ${enrichment.id}: ${error instanceof Error ? error.message : "unknown"}`,
      );
      await this.database.jobEnrichment.update({
        where: { id: enrichment.id },
        data: { enrichmentStatus: "PENDING" },
      });
      return;
    }

    await this.database.jobEnrichment.update({
      where: { id: enrichment.id },
      data: {
        semanticFilterReason: decision.reason,
        semanticFilterResult: decision.result,
        semanticFilterVersion: decision.configVersion,
      },
    });

    if (decision.result === "SKIP") {
      await this.database.jobEnrichment.update({
        where: { id: enrichment.id },
        data: { enrichmentStatus: "SKIPPED" },
      });
      return;
    }

    try {
      const department = getDepartmentFromMetadata(enrichment.job.metadataJson);
      const result = await this.enrich({
        department,
        descriptionClean: enrichment.job.descriptionClean,
        title: enrichment.job.title,
      });

      await this.database.jobEnrichment.update({
        where: { id: enrichment.id },
        data: {
          ...result,
          enrichedAt: new Date(),
          enrichmentModel: getAiModel("JOB_ENRICHMENT"),
          enrichmentStatus: "COMPLETED",
          enrichmentVersion: JOB_ENRICHMENT_PROMPT_VERSION,
        },
      });
    } catch (error) {
      const attempts = enrichment.attempts + 1;
      const failed = attempts >= this.maxAttempts;
      const message = error instanceof Error ? error.message : "unknown error";

      this.logger.warn(
        `job enrichment ${enrichment.id} failed (attempt ${attempts}): ${message}`,
      );

      await this.database.jobEnrichment.update({
        where: { id: enrichment.id },
        data: {
          attempts,
          enrichmentError: message,
          enrichmentStatus: failed ? "FAILED" : "PENDING",
        },
      });
    }
  }
}
