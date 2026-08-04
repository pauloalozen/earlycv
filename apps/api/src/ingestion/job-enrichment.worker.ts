import { randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  Optional,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { IngestionJobTrigger } from "@prisma/client";
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
const LOCK_RETRY_ATTEMPTS = 6;
const LOCK_RETRY_DELAY_MS = 500;

// processItem marca PROCESSING antes de chamar o LLM. Se o processo morrer
// no meio disso (deploy, restart, OOM) o registro fica preso em PROCESSING
// pra sempre, porque o batch so busca PENDING. Qualquer PROCESSING mais
// velho que esse limite e tratado como orfao e volta pra fila (ou FAILED,
// se ja esgotou attempts).
const STALE_PROCESSING_THRESHOLD_MS = 10 * 60_000;

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

    // Log removido de proposito — BASE_TICK_CRON roda a cada 5s, entao com
    // o worker desligado isso poluia o log com a mesma linha repetida
    // indefinidamente sem informacao nova.
    if (!config.enrichmentEnabled) {
      return 0;
    }

    if (!doesSecondsCronMatchDate(config.enrichmentCronExpression, now)) {
      return 0;
    }

    return this.processPendingBatch("SCHEDULE");
  }

  // Ciclo manual ("Processar agora"): roda mesmo com o worker desabilitado,
  // respeitando apenas o enrichmentBatchSize configurado. Fire-and-forget —
  // so prepara o lote (rapido: lock + consulta + cria o EnrichmentBatchRun)
  // e retorna, sem esperar cada item processar. Quem chama acompanha o
  // progresso via listRuns()/getCurrentRun() e pode interromper via
  // requestCancel(); a promise `completion` so existe pra testes
  // conseguirem esperar o lote de verdade terminar.
  async runNow() {
    const prepared = await this.prepareBatch();

    if (!prepared) {
      throw new Error("job enrichment worker lock is busy, try again shortly");
    }

    const completion = this.executeBatch(prepared).catch((error) => {
      this.logger.error(
        `enrichment batch ${prepared.batchRun.id} failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    });

    return { batchRun: prepared.batchRun, completion };
  }

  // Historico + estado atual pra aba Enriquecimento acompanhar/cancelar
  // um lote, igual ja existe pro IngestionBatchRun do crawl.
  listRuns(limit = 20) {
    return this.database.enrichmentBatchRun.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: limit,
    });
  }

  getCurrentRun() {
    return this.database.enrichmentBatchRun.findFirst({
      orderBy: [{ createdAt: "desc" }],
      where: { status: { in: ["QUEUED", "RUNNING"] } },
    });
  }

  async requestCancel(runId: string) {
    const run = await this.database.enrichmentBatchRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`enrichment batch run ${runId} not found`);
    }

    if (run.status !== "QUEUED" && run.status !== "RUNNING") {
      return run;
    }

    return this.database.enrichmentBatchRun.update({
      data: { cancelRequestedAt: new Date() },
      where: { id: runId },
    });
  }

  // Processa uma vaga especifica imediatamente, sem depender da posicao
  // dela na fila FIFO do batch (processPendingBatch pega sempre as
  // enrichmentBatchSize mais antigas por createdAt — com backlog grande,
  // uma vaga PENDING recem-resetada pode nunca ser alcancada). Usado pelo
  // botao "Enriquecer agora"/"Enriquecer" por linha nas telas de admin.
  //
  // O lock e compartilhado com o cron do batch (tick a cada 5s), que pode
  // segura-lo por varios segundos processando itens reais. Sem retry, um
  // clique que cai nessa janela falhava em silencio (processed: false sem
  // erro) e a UI reportava sucesso indevido. Faz poll curto pelo lock antes
  // de desistir; se mesmo assim nao conseguir, lanca erro pra propagar a
  // falha real ate o usuario.
  async processOne(jobEnrichmentId: string, options?: { force?: boolean }) {
    const owner = `job-enrichment-worker-single-${randomUUID()}`;
    const acquired = await this.acquireLockWithRetry(owner);

    if (!acquired) {
      throw new Error("job enrichment worker lock is busy, try again shortly");
    }

    try {
      const enrichment = await this.database.jobEnrichment.findUnique({
        where: { id: jobEnrichmentId },
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

      if (!enrichment) {
        return { processed: false };
      }

      await this.processItem(enrichment, { force: options?.force ?? false });
      return { processed: true };
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  private async acquireLockWithRetry(owner: string) {
    for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt++) {
      const acquired = await this.lockRepository.acquire(
        LOCK_ID,
        owner,
        LOCK_TTL_MS,
      );
      if (acquired) {
        return true;
      }
      if (attempt < LOCK_RETRY_ATTEMPTS - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, LOCK_RETRY_DELAY_MS),
        );
      }
    }
    return false;
  }

  // Ticks automaticos NUNCA criam EnrichmentBatchRun — o admin controla o
  // worker pelo toggle, e historico/cancelamento por lote (banner "lote em
  // andamento") e reservado pra disparos manuais. Sem essa distincao, todo
  // tick — mesmo vazio — virava uma linha no historico, e o "em andamento"
  // nunca sumia de fato: o tick seguinte ja recriava outro lote RUNNING
  // antes do anterior desaparecer da tela.
  async processPendingBatch(trigger: IngestionJobTrigger = "SCHEDULE") {
    if (trigger === "MANUAL") {
      const prepared = await this.prepareBatch();
      if (!prepared) {
        return 0;
      }

      await this.executeBatch(prepared);
      return prepared.pending.length;
    }

    return this.processScheduledBatch();
  }

  private async processScheduledBatch() {
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
      await this.recoverStaleProcessing();
      const config = await this.enrichmentConfigService.getConfig();
      const pending = await this.queryPendingItems(config.enrichmentBatchSize);

      for (const enrichment of pending) {
        await this.processItem(enrichment);
      }

      return pending.length;
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  private async queryPendingItems(batchSize: number) {
    return this.database.jobEnrichment.findMany({
      where: { enrichmentStatus: "PENDING" },
      orderBy: [{ createdAt: "asc" }],
      take: batchSize,
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
  }

  private async prepareBatch() {
    const owner = `job-enrichment-worker-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );

    if (!acquired) {
      return null;
    }

    await this.recoverStaleProcessing();

    const config = await this.enrichmentConfigService.getConfig();
    const pending = await this.queryPendingItems(config.enrichmentBatchSize);

    const batchRun = await this.database.enrichmentBatchRun.create({
      data: {
        batchSize: pending.length,
        startedAt: new Date(),
        status: "RUNNING",
        triggeredBy: "MANUAL",
      },
    });

    return { batchRun, owner, pending };
  }

  private async executeBatch(prepared: {
    batchRun: { id: string };
    owner: string;
    pending: Array<Parameters<JobEnrichmentWorker["processItem"]>[0]>;
  }) {
    const { batchRun, owner, pending } = prepared;

    try {
      let cancelled = false;

      for (const enrichment of pending) {
        const current = await this.database.enrichmentBatchRun.findUnique({
          where: { id: batchRun.id },
        });
        if (current?.cancelRequestedAt) {
          cancelled = true;
          break;
        }

        await this.processItem(enrichment);

        await this.database.enrichmentBatchRun.update({
          data: { processedCount: { increment: 1 } },
          where: { id: batchRun.id },
        });
      }

      await this.database.enrichmentBatchRun.update({
        data: {
          finishedAt: new Date(),
          status: cancelled ? "CANCELLED" : "COMPLETED",
        },
        where: { id: batchRun.id },
      });
    } catch (error) {
      await this.database.enrichmentBatchRun.update({
        data: {
          errorMessage:
            error instanceof Error ? error.message : "unknown error",
          finishedAt: new Date(),
          status: "FAILED",
        },
        where: { id: batchRun.id },
      });
      throw error;
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  private async recoverStaleProcessing() {
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);
    const stuck = await this.database.jobEnrichment.findMany({
      where: { enrichmentStatus: "PROCESSING" },
    });

    for (const item of stuck) {
      if (item.updatedAt >= staleThreshold) continue;

      const attempts = item.attempts + 1;
      const failed = attempts >= this.maxAttempts;

      this.logger.warn(
        `job enrichment ${item.id} recovered from stale PROCESSING (attempt ${attempts})`,
      );

      await this.database.jobEnrichment.update({
        where: { id: item.id },
        data: {
          attempts,
          enrichmentError:
            "stale PROCESSING recuperado pelo worker (processo provavelmente reiniciado durante o enriquecimento)",
          enrichmentStatus: failed ? "FAILED" : "PENDING",
        },
      });
    }
  }

  private async processItem(
    enrichment: {
      attempts: number;
      id: string;
      job: {
        descriptionClean: string;
        metadataJson: unknown;
        normalizedTitle: string;
        title: string;
      };
    },
    options?: { force?: boolean },
  ) {
    await this.database.jobEnrichment.update({
      where: { id: enrichment.id },
      data: { enrichmentStatus: "PROCESSING" },
    });

    // "Forcar LLM" (botao admin pra vaga marcada SKIPPED por engano):
    // pula a avaliacao do filtro semantico e vai direto pro enriquecimento,
    // registrando o motivo pra deixar rastro de que foi decisao manual.
    if (options?.force) {
      await this.database.jobEnrichment.update({
        where: { id: enrichment.id },
        data: {
          semanticFilterReason: "forced_by_admin",
          semanticFilterResult: "ENRICH",
        },
      });
    } else {
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
