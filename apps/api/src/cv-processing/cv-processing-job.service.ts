// CvProcessingJob — processamento genérico e durável de um CV (extração +
// Base de Talentos + Master opcional), separado de AnalysisJob. Plano,
// docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, seção 1.
//
// Claim atômico: UPDATE ... WHERE id = $1 AND status = 'PENDING' é uma
// única sentença SQL, atômica no Postgres por si só — duas chamadas
// concorrentes de claimOne() para o mesmo job nunca conseguem as duas
// contar 1 linha afetada (mesmo padrão já usado em
// AnalysisJob.updateMany na transferência de ownership guest->usuário,
// cv-adaptation.service.ts#claimGuestAnalysisJob).
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { CvProcessingJob, CvProcessingMasterIntent } from "@prisma/client";

import { DatabaseService } from "../database/database.service";

export const MAX_CV_PROCESSING_ATTEMPTS = 3;
export const STALE_PROCESSING_THRESHOLD_MS = 10 * 60_000;

export type CreateCvProcessingJobInput = {
  cvSourceId: string;
  cvSubmissionId: string;
  masterIntent?: CvProcessingMasterIntent;
};

@Injectable()
export class CvProcessingJobService {
  private readonly logger = new Logger(CvProcessingJobService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  // Dedup: se já existe um job PENDING/PROCESSING para o mesmo cvSourceId,
  // reaproveita em vez de enfileirar um duplicado concorrente (evita duas
  // extrações da mesma fonte rodando em paralelo). Um job já READY/FAILED
  // não bloqueia a criação de um novo (ex.: novo masterIntent explícito).
  async enqueue(input: CreateCvProcessingJobInput): Promise<CvProcessingJob> {
    const reusable = await this.database.cvProcessingJob.findFirst({
      where: {
        cvSourceId: input.cvSourceId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (reusable) {
      return reusable;
    }

    return this.database.cvProcessingJob.create({
      data: {
        cvSourceId: input.cvSourceId,
        cvSubmissionId: input.cvSubmissionId,
        masterIntent: input.masterIntent ?? "NONE",
        status: "PENDING",
      },
    });
  }

  async getById(id: string): Promise<CvProcessingJob | null> {
    return this.database.cvProcessingJob.findUnique({ where: { id } });
  }

  async findPending(limit: number): Promise<CvProcessingJob[]> {
    return this.database.cvProcessingJob.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  // Claim atômico de um job específico — PENDING -> PROCESSING. Retorna o
  // job já atualizado se este worker venceu a corrida, ou null se outro
  // worker (ou uma recuperação de stale concorrente) já o pegou primeiro.
  async claimOne(
    jobId: string,
    workerId: string,
  ): Promise<CvProcessingJob | null> {
    const result = await this.database.cvProcessingJob.updateMany({
      where: { id: jobId, status: "PENDING" },
      data: {
        status: "PROCESSING",
        claimedAt: new Date(),
        workerId,
        attempts: { increment: 1 },
      },
    });

    if (result.count !== 1) {
      return null;
    }

    return this.database.cvProcessingJob.findUnique({ where: { id: jobId } });
  }

  // Mesmo padrão de recuperação de "processing travado" já usado pelo
  // Monitor (monitor-profile-matching.worker.ts#recoverStaleProcessing):
  // um claimedAt antigo demais indica que o worker que reivindicou o job
  // morreu no meio do processamento (deploy, crash, OOM) — nunca fica
  // preso pra sempre em PROCESSING. Volta pra PENDING (retry) ou vai pra
  // FAILED se já esgotou as tentativas.
  async recoverStaleProcessing(): Promise<number> {
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);
    const stuck = await this.database.cvProcessingJob.findMany({
      where: { status: "PROCESSING", claimedAt: { lt: staleThreshold } },
    });

    for (const job of stuck) {
      const failed = job.attempts >= MAX_CV_PROCESSING_ATTEMPTS;

      this.logger.warn(
        `cv processing job ${job.id} recovered from stale PROCESSING (attempt ${job.attempts})`,
      );

      await this.database.cvProcessingJob.update({
        where: { id: job.id },
        data: {
          status: failed ? "FAILED" : "PENDING",
          claimedAt: null,
          workerId: null,
          lastError: failed
            ? job.lastError
            : "stale PROCESSING recuperado pelo worker (processo provavelmente reiniciado durante o processamento)",
          finishedAt: failed ? new Date() : null,
        },
      });
    }

    return stuck.length;
  }

  async markReady(
    jobId: string,
    data: {
      cvStructuredProfileId: string;
      masterDesignationId?: string | null;
    },
  ): Promise<CvProcessingJob> {
    return this.database.cvProcessingJob.update({
      where: { id: jobId },
      data: {
        status: "READY",
        cvStructuredProfileId: data.cvStructuredProfileId,
        masterDesignationId: data.masterDesignationId ?? null,
        lastError: null,
        finishedAt: new Date(),
      },
    });
  }

  // Retry: nunca cria outro AnalysisJob (seção 1.4) — só reseta o próprio
  // CvProcessingJob. Os AnalysisJob que dependem dele retomam sozinhos
  // (via leitura de status) assim que ele chegar a READY.
  async markFailed(jobId: string, error: unknown): Promise<CvProcessingJob> {
    const message = error instanceof Error ? error.message : String(error);
    const job = await this.database.cvProcessingJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    const failed = job.attempts >= MAX_CV_PROCESSING_ATTEMPTS;

    return this.database.cvProcessingJob.update({
      where: { id: jobId },
      data: {
        status: failed ? "FAILED" : "PENDING",
        lastError: message,
        claimedAt: null,
        workerId: null,
        finishedAt: failed ? new Date() : null,
      },
    });
  }
}
