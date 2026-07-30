import { randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  Optional,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type OpenAI from "openai";

import { getAiModel } from "../common/ai-client-factory";
import { DatabaseService } from "../database/database.service";
import { doesSecondsCronMatchDate } from "./cron-utils";
import { EnrichmentConfigService } from "./enrichment-config.service";
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

// Tick base fixo do NestJS @Cron: precisa ser mais fino que o menor
// enrichmentCronExpression configuravel em banco (default "*/10 * * * * *")
// pra doesSecondsCronMatchDate ter chance de casar. O intervalo real
// efetivo continua controlado pelo config em banco (Ajuste 1), lido a
// cada tick com cache de 60s — igual ao SemanticFilterService.
const BASE_TICK_CRON = "*/5 * * * * *";

type JobEnrichmentWorkerOptions = {
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
export class JobEnrichmentWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobEnrichmentWorker.name);
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
    @Inject(EnrichmentConfigService)
    private readonly enrichmentConfigService: EnrichmentConfigService,
    @Optional()
    @Inject(JOB_ENRICHMENT_AI_CLIENT)
    aiClient?: OpenAI,
    @Optional()
    @Inject(JOB_ENRICHMENT_WORKER_OPTIONS)
    options: JobEnrichmentWorkerOptions = {},
  ) {
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

  onApplicationBootstrap() {
    this.logger.log(
      `JobEnrichmentWorker iniciado — cron base: ${BASE_TICK_CRON}`,
    );
  }

  @Cron(BASE_TICK_CRON)
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    await this.runScheduledCycle(new Date());
  }

  // Extraido do tick() pra ser testavel sem depender do guard de
  // NODE_ENV === "test" do decorator @Cron.
  async runScheduledCycle(now: Date) {
    const config = await this.enrichmentConfigService.getConfig();

    if (!config.enrichmentEnabled) {
      this.logger.log("job enrichment worker is disabled, skipping tick");
      return 0;
    }

    if (!doesSecondsCronMatchDate(config.enrichmentCronExpression, now)) {
      return 0;
    }

    return this.processPendingBatch();
  }

  // Ciclo manual (Ajuste 3 — "Disparar agora"): roda mesmo com o worker
  // desabilitado, respeitando apenas o enrichmentBatchSize configurado.
  async runNow() {
    return this.processPendingBatch();
  }

  async processPendingBatch() {
    const owner = `job-enrichment-worker-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );

    if (!acquired) {
      return 0;
    }

    try {
      const config = await this.enrichmentConfigService.getConfig();
      const pending = await this.database.jobEnrichment.findMany({
        where: { enrichmentStatus: "PENDING" },
        orderBy: [{ createdAt: "asc" }],
        take: config.enrichmentBatchSize,
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

      return pending.length;
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
