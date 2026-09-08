// Worker do AnalysisJob do pipeline canônico de CV — Fase 2C
// (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, seções 1.2,
// 1.4 e 11). Roda em ciclo de cron separado do CvProcessingWorker (mesmo
// padrão de lock/claim, lock id próprio) — nunca faz polling bloqueante
// (while/loop de espera ativa) esperando o CvProcessingJob terminar: cada
// ciclo lê o estado atual persistido e decide processar ou deixar pro
// próximo ciclo.
//
// Escopo estrito: só processa AnalysisJob com cvProcessingJobId preenchido
// (linhas do pipeline novo, criadas por
// cv-adaptation.service#startAuthenticatedAnalysisJobCanonical). Nunca toca
// em AnalysisJob do caminho legado (cvProcessingJobId null) — o
// processamento fire-and-forget legado (processAnalysisJob) continua
// intocado, mesmo com este worker rodando ao lado.
import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { AnalysisJob, CvProcessingJob } from "@prisma/client";

import {
  CV_PROCESSING_JOB_READY,
  cvProcessingDispatchSignal,
} from "../cv-processing/cv-processing-dispatch.signal";
import { CvUserProfileSyncService } from "../cv-processing/cv-user-profile-sync.service";
import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import type { CanonicalCvProfileData } from "./cv-adaptation-ai.service";
import { CvAdaptationService } from "./cv-adaptation.service";

const LOCK_ID = "cv-analysis-worker";
const LOCK_TTL_MS = 5 * 60_000;
const BASE_TICK_CRON = "*/15 * * * * *";
const BATCH_SIZE = 5;
// Mesmo limiar de recuperação de "processing travado" usado pelo
// CvProcessingWorker (STALE_PROCESSING_THRESHOLD_MS) — um AnalysisJob do
// pipeline novo que ficou em "processing" por tempo demais (worker morreu
// no meio, ver teste 17) volta pra "pending" e é retomado por outro
// ciclo/worker, sem duplicar a análise em si (a claim atômica de
// "pending" -> "processing" impede dois workers rodarem a mesma análise).
const STALE_PROCESSING_THRESHOLD_MS = 10 * 60_000;

@Injectable()
export class CvAnalysisWorker {
  private readonly logger = new Logger(CvAnalysisWorker.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
    @Inject(CvUserProfileSyncService)
    private readonly userProfileSync: Pick<
      CvUserProfileSyncService,
      "toCanonicalProfileData"
    >,
    @Inject(CvAdaptationService)
    private readonly cvAdaptationService: Pick<
      CvAdaptationService,
      | "renderCanonicalProfileTextForPipeline"
      | "runCanonicalAuthenticatedAnalysis"
      | "runCanonicalGuestAnalysis"
      | "extractAnalysisJobSignalsForPipeline"
    >,
  ) {
    // Mesmo raciocínio de CvProcessingWorker: nunca se inscreve durante
    // testes (evita listener acumulando entre as várias instâncias
    // efêmeras que cada e2e-spec cria contra o mesmo EventEmitter
    // singleton do processo).
    if (process.env.NODE_ENV !== "test") {
      cvProcessingDispatchSignal.on(
        CV_PROCESSING_JOB_READY,
        (cvProcessingJobId: string) =>
          this.triggerProcessingForCvProcessingJob(cvProcessingJobId),
      );
    }
  }

  @Cron(BASE_TICK_CRON)
  async tick() {
    if (process.env.NODE_ENV === "test") return;
    await this.processPendingBatch();
  }

  // Disparo imediato — mesmo contrato de CvProcessingWorker#triggerProcessing:
  // nunca cria job, claim atômico (via #claim, mesma técnica do cron),
  // nunca lança pro chamador, nunca marca failed só por não ter rodado.
  // Escopo por cvProcessingJobId (não por AnalysisJob.id) porque mais de um
  // AnalysisJob pode referenciar o MESMO CvProcessingJob (reuso por
  // dedup/hash) — o evento READY é do CvProcessingJob, processa todos os
  // AnalysisJob pending elegíveis dele, não só um.
  triggerProcessingForCvProcessingJob(cvProcessingJobId: string): void {
    this.processEligibleForCvProcessingJob(cvProcessingJobId).catch((err) => {
      this.logger.error(
        `cv analysis trigger(cvProcessingJobId=${cvProcessingJobId}) falhou (jobs permanecem pending/claimable, cron recupera): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  private async processEligibleForCvProcessingJob(
    cvProcessingJobId: string,
  ): Promise<number> {
    // Sem lock global — mesmo raciocínio de CvProcessingWorker#processOneJob:
    // a atomicidade real é o claim por linha (#claim), lock global aqui só
    // serializaria triggers de CvProcessingJob diferentes à toa.
    const candidates = await this.database.analysisJob.findMany({
      where: { cvProcessingJobId, status: "pending" },
      include: { cvProcessingJob: true },
    });
    return this.processCandidates(candidates);
  }

  async processPendingBatch(): Promise<number> {
    const owner = `cv-analysis-worker-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );
    if (!acquired) return 0;

    try {
      await this.recoverStaleProcessing();

      const candidates = await this.database.analysisJob.findMany({
        where: { cvProcessingJobId: { not: null }, status: "pending" },
        orderBy: { createdAt: "asc" },
        take: BATCH_SIZE,
        include: { cvProcessingJob: true },
      });

      return this.processCandidates(candidates);
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  // Corpo compartilhado do processamento por candidato — usado pelo scan de
  // lote (processPendingBatch, sob o lock global) e pelo disparo imediato
  // escopado (processEligibleForCvProcessingJob, sem lock global). O claim
  // atômico por linha (#claim) é a única garantia de exclusividade que
  // importa em qualquer um dos dois caminhos.
  private async processCandidates(
    candidates: Array<
      AnalysisJob & { cvProcessingJob: CvProcessingJob | null }
    >,
  ): Promise<number> {
    let processed = 0;
    for (const job of candidates) {
      if (!job.cvProcessingJob) continue; // estado inconsistente, nunca deveria acontecer

      if (job.cvProcessingJob.status === "FAILED") {
        const claimed = await this.claim(job.id);
        if (!claimed) continue; // outro worker/ciclo já pegou
        await this.database.analysisJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            finishedAt: new Date(),
            lastError:
              job.cvProcessingJob.lastError ??
              "o processamento do CV (extração) falhou antes da análise poder rodar",
          },
        });
        processed += 1;
        continue;
      }

      if (job.cvProcessingJob.status !== "READY") {
        // PENDING/PROCESSING — ainda não é hora. Nunca aguarda ativamente
        // aqui: só deixa pro próximo ciclo de cron/trigger reavaliar.
        continue;
      }

      const claimed = await this.claim(job.id);
      if (!claimed) continue;

      await this.processReadyJob(claimed, {
        cvStructuredProfileId: job.cvProcessingJob.cvStructuredProfileId,
      });
      processed += 1;
    }

    return processed;
  }

  // Claim atômico — mesma técnica de cv-processing-job.service.ts#claimOne:
  // UPDATE ... WHERE id = $1 AND status = 'pending' é uma única sentença
  // SQL atômica no Postgres; duas chamadas concorrentes nunca conseguem as
  // duas contar 1 linha afetada, então dois workers nunca executam a mesma
  // análise.
  private async claim(jobId: string): Promise<AnalysisJob | null> {
    const result = await this.database.analysisJob.updateMany({
      where: { id: jobId, status: "pending" },
      data: { status: "processing", startedAt: new Date() },
    });
    if (result.count !== 1) return null;
    return this.database.analysisJob.findUnique({ where: { id: jobId } });
  }

  private async recoverStaleProcessing(): Promise<number> {
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);
    const stuck = await this.database.analysisJob.findMany({
      where: {
        cvProcessingJobId: { not: null },
        status: "processing",
        startedAt: { lt: staleThreshold },
      },
    });

    for (const job of stuck) {
      this.logger.warn(
        `analysis job ${job.id} recuperado de "processing" travado (worker provavelmente reiniciado durante a análise)`,
      );
      await this.database.analysisJob.update({
        where: { id: job.id },
        data: { status: "pending", startedAt: null },
      });
    }

    return stuck.length;
  }

  private async processReadyJob(
    job: AnalysisJob,
    cvProcessingJob: { cvStructuredProfileId: string | null },
  ): Promise<void> {
    try {
      if (!cvProcessingJob.cvStructuredProfileId) {
        throw new Error(
          "CvProcessingJob está READY mas sem cvStructuredProfileId — estado inconsistente",
        );
      }

      const structuredProfile =
        await this.database.cvStructuredProfile.findUniqueOrThrow({
          where: { id: cvProcessingJob.cvStructuredProfileId },
        });

      if (structuredProfile.status !== "READY") {
        throw new Error(
          "CvStructuredProfile referenciado pelo CvProcessingJob READY não está READY — estado inconsistente",
        );
      }

      // canonicalJson é o dado real que vai pro PROMPT da IA de análise
      // (nunca achatado em texto — ver runCanonicalAuthenticatedAnalysis/
      // runCanonicalGuestAnalysis). Guarda defensiva: READY sem canonicalJson
      // é estado inconsistente (nunca deveria acontecer — o worker do
      // pipeline só marca READY depois de gravar canonicalJson), mas o job
      // não pode seguir pra análise sem ele.
      if (!structuredProfile.canonicalJson) {
        throw new Error(
          "CvStructuredProfile READY sem canonicalJson — estado inconsistente",
        );
      }
      const canonicalCvProfile =
        structuredProfile.canonicalJson as CanonicalCvProfileData;

      // canonicalText continua existindo só pra trilha de auditoria/
      // histórico (AnalysisCvSnapshot.text, AnalysisJob.masterCvText) —
      // NUNCA vai pro prompt da IA (isso agora é canonicalCvProfile acima).
      const mapped = this.userProfileSync.toCanonicalProfileData(
        structuredProfile.canonicalJson as never,
      );
      const canonicalText =
        this.cvAdaptationService.renderCanonicalProfileTextForPipeline({
          ...mapped,
          certifications: mapped.certifications ?? [],
          education: mapped.education ?? [],
          experiences: mapped.experiences ?? [],
          languages: mapped.languages ?? [],
          skills: mapped.skills ?? { technical: [], business: [], soft: [] },
        });

      // Fase 2D: AnalysisJob do pipeline canônico agora também cobre o
      // caminho de visitante (ownerKind "guest", userId null,
      // guestSessionHash preenchido pelo entrypoint) — mesma claim/estado
      // READY, mesma garantia da seção 11, só troca qual análise real
      // (autenticada x guest) roda no fim.
      const result = job.userId
        ? await this.cvAdaptationService.runCanonicalAuthenticatedAnalysis({
            canonicalCvProfile,
            cvStructuredProfileId: structuredProfile.id,
            canonicalCvText: canonicalText,
            jobDescriptionText: job.jobDescriptionText,
            userId: job.userId,
          })
        : await this.cvAdaptationService.runCanonicalGuestAnalysis({
            canonicalCvProfile,
            cvStructuredProfileId: structuredProfile.id,
            canonicalCvText: canonicalText,
            jobDescriptionText: job.jobDescriptionText,
            guestSessionHash: job.guestSessionHash,
          });

      const signals =
        this.cvAdaptationService.extractAnalysisJobSignalsForPipeline(
          result.adaptedContentJson,
        );

      await this.database.analysisJob.update({
        where: { id: job.id },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          adaptedContentJson: result.adaptedContentJson as never,
          previewText: result.previewText,
          masterCvText: result.masterCvText,
          analysisCvSnapshotId: result.analysisCvSnapshotId,
          cvStructuredProfileId: structuredProfile.id,
          jobTitle: signals.jobTitle,
          companyName: signals.companyName,
          scoreBefore: signals.scoreBefore,
          scoreAfter: signals.scoreAfter,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`analysis job ${job.id} falhou: ${message}`);
      await this.database.analysisJob.update({
        where: { id: job.id },
        data: { status: "failed", finishedAt: new Date(), lastError: message },
      });
    }
  }
}
