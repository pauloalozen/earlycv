import { Inject, Injectable, Logger } from "@nestjs/common";
import type { IngestionJob, IngestionJobTrigger } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { calculateNextRunAt } from "./ingestion-job-schedule.util";
import { JobEnrichmentWorker } from "./job-enrichment.worker";
import { ManualIngestionBatchRepository } from "./manual-ingestion-batch.repository";

// Logica de disparo compartilhada entre o tick agendado
// (IngestionJobSchedulerService) e o disparo manual
// (IngestionJobService.runNow) — um unico lugar decide como um
// IngestionJob vira um IngestionBatchRun (CRAWL ou LOGO_FETCH, drenados por
// IngestionManualRunnerService) ou um ciclo do worker de enriquecimento
// (ENRICHMENT), e como a proxima execucao e recalculada.
@Injectable()
export class IngestionJobDispatchService {
  private readonly logger = new Logger(IngestionJobDispatchService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ManualIngestionBatchRepository)
    private readonly manualBatchRepository: ManualIngestionBatchRepository,
    @Inject(JobEnrichmentWorker)
    private readonly enrichmentWorker: JobEnrichmentWorker,
  ) {}

  async dispatchJob(job: IngestionJob, trigger: IngestionJobTrigger) {
    const jobRun = await this.database.ingestionJobRun.create({
      data: {
        jobId: job.id,
        jobName: job.name,
        jobType: job.jobType,
        status: "QUEUED",
        triggeredBy: trigger,
      },
    });

    try {
      if (
        job.jobType === "CRAWL" ||
        job.jobType === "LOGO_FETCH" ||
        job.jobType === "DISCOVERY_VALIDATE"
      ) {
        const batchRun =
          job.jobType === "CRAWL"
            ? await this.createBatchForJob(job)
            : job.jobType === "LOGO_FETCH"
              ? await this.createLogoFetchBatchForJob(job)
              : await this.createDiscoveryValidateBatchForJob(job);
        await this.database.ingestionJobRun.update({
          data: {
            batchRunId: batchRun.id,
            startedAt: new Date(),
            status: "RUNNING",
          },
          where: { id: jobRun.id },
        });
      } else {
        await this.database.ingestionJobRun.update({
          data: { startedAt: new Date(), status: "RUNNING" },
          where: { id: jobRun.id },
        });
        await this.enrichmentWorker.runNow();
        await this.database.ingestionJobRun.update({
          data: { finishedAt: new Date(), status: "COMPLETED" },
          where: { id: jobRun.id },
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "dispatch failed";
      this.logger.warn(`ingestion job ${job.id} dispatch failed: ${message}`);
      await this.database.ingestionJobRun.update({
        data: {
          errorMessage: message,
          finishedAt: new Date(),
          status: "FAILED",
        },
        where: { id: jobRun.id },
      });
      await this.updateJobAfterRun(job);
      throw error;
    }

    await this.updateJobAfterRun(job);

    return this.database.ingestionJobRun.findUniqueOrThrow({
      where: { id: jobRun.id },
    });
  }

  private async updateJobAfterRun(job: IngestionJob) {
    const now = new Date();
    await this.database.ingestionJob.update({
      data: {
        lastRunAt: now,
        nextRunAt: calculateNextRunAt(job, now),
      },
      where: { id: job.id },
    });
  }

  private async createBatchForJob(job: IngestionJob) {
    if (job.scopeType === "ADAPTER") {
      if (!job.adapterType) {
        throw new Error("adapterType is required for ADAPTER scope");
      }
      return this.manualBatchRepository.createAdapterBatchRun({
        adapterType: job.adapterType,
      });
    }

    if (job.scopeType === "SOURCE") {
      if (!job.jobSourceId) {
        throw new Error("jobSourceId is required for SOURCE scope");
      }
      return this.manualBatchRepository.createSourceBatchRun({
        jobSourceId: job.jobSourceId,
      });
    }

    return this.manualBatchRepository.createGlobalBatchRun({});
  }

  // Escopo de LOGO_FETCH so suporta ADAPTER/ALL (sem "fonte especifica" —
  // logo e por Company, nao por JobSource individual, e o modal de criacao
  // nem oferece essa opcao pra esse jobType).
  private async createLogoFetchBatchForJob(job: IngestionJob) {
    if (job.scopeType === "SOURCE") {
      throw new Error(
        "escopo 'fonte específica' não é suportado para carregar logo",
      );
    }

    if (job.scopeType === "ADAPTER") {
      if (!job.adapterType) {
        throw new Error("adapterType is required for ADAPTER scope");
      }
      return this.manualBatchRepository.createLogoFetchBatchRun({
        adapterType: job.adapterType,
        onlyMissingLogo: job.onlyMissingLogo,
      });
    }

    return this.manualBatchRepository.createLogoFetchBatchRun({
      onlyMissingLogo: job.onlyMissingLogo,
    });
  }

  // DISCOVERY_VALIDATE nao tem escopo (nao existe eixo adapter/fonte pra
  // candidato de descoberta) — sempre processa os PENDING mais antigos,
  // ate discoveryValidateLimit (ou fila inteira se ausente).
  private async createDiscoveryValidateBatchForJob(job: IngestionJob) {
    return this.manualBatchRepository.createDiscoveryValidateBatchRun({
      candidateLimit: job.discoveryValidateLimit ?? undefined,
    });
  }
}
