// Worker do CvProcessingJob — plano, seção 1.1: claim atômico, extração
// (IA fora de transação), captura da Base de Talentos (sempre), promoção
// de Master opcional (com UserProfile sync + MonitorProjectionJob na MESMA
// transação Prisma da promoção — nunca depois), markReady/markFailed.
//
// Roda em ciclo de cron separado (mesmo padrão do Monitor —
// MonitorProfileMatchingWorker), nunca como Promise fire-and-forget dentro
// de um request HTTP: todo trabalho que precisa sobreviver ao request já
// está representado pela linha de CvProcessingJob persistida pelo
// entrypoint (resumes.service.ts/cv-adaptation.service.ts) ANTES da
// resposta HTTP.
import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { CvProcessingJob } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { StorageService } from "../storage/storage.service";
import { CvMasterPromotionService } from "./cv-master-promotion.service";
import {
  CvSourceTextObjectMissingError,
  MasterDesignationSubjectMismatchError,
} from "./cv-processing.errors";
import {
  CvProcessingJobService,
  MAX_CV_PROCESSING_ATTEMPTS,
} from "./cv-processing-job.service";
import {
  CvStructuredProfileExtractionService,
  type ExtractionClient,
} from "./cv-structured-profile-extraction.service";
import { CvTalentCaptureService } from "./cv-talent-capture.service";

const LOCK_ID = "cv-processing-worker";
const LOCK_TTL_MS = 5 * 60_000;
const BASE_TICK_CRON = "*/15 * * * * *";
const BATCH_SIZE = 5;
const EXTRACTOR_VERSION = "v1";
const SCHEMA_VERSION = "v1";

@Injectable()
export class CvProcessingWorker {
  private readonly logger = new Logger(CvProcessingWorker.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
    @Inject(CvProcessingJobService)
    private readonly jobService: CvProcessingJobService,
    @Inject(CvStructuredProfileExtractionService)
    private readonly extractionClient: ExtractionClient,
    @Inject(CvTalentCaptureService)
    private readonly talentCapture: CvTalentCaptureService,
    @Inject(CvMasterPromotionService)
    private readonly masterPromotion: CvMasterPromotionService,
    @Inject(StorageService)
    private readonly storage: Pick<StorageService, "getObject">,
  ) {}

  @Cron(BASE_TICK_CRON)
  async tick() {
    if (process.env.NODE_ENV === "test") return;
    await this.processPendingBatch();
  }

  async processPendingBatch(): Promise<number> {
    const owner = `cv-processing-worker-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );
    if (!acquired) return 0;

    try {
      await this.jobService.recoverStaleProcessing();

      const pending = await this.jobService.findPending(BATCH_SIZE);
      let processed = 0;
      for (const job of pending) {
        const claimed = await this.jobService.claimOne(job.id, owner);
        if (!claimed) continue; // outro worker venceu a corrida do claim
        await this.processJob(claimed);
        processed += 1;
      }
      return processed;
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  private async processJob(job: CvProcessingJob): Promise<void> {
    try {
      const cvSource = await this.database.cvSource.findUniqueOrThrow({
        where: { id: job.cvSourceId },
      });
      const text = await this.readSourceText(cvSource);

      // 1. Extração — chamada de IA fora de qualquer transação.
      const structuredProfile = await this.ensureStructuredProfile(
        job.cvSourceId,
        text,
      );

      // 2. Base de Talentos — sempre, independente de virar Master (seção 2).
      const owner = this.resolveOwner(cvSource);
      await this.talentCapture.capture({
        owner,
        cvSourceId: job.cvSourceId,
        cvStructuredProfileId: structuredProfile.id,
        canonicalProfile: structuredProfile.canonicalJson as never,
      });

      // 3. Promoção de Master opcional — promoção + UserProfile sync +
      // MonitorProjectionJob numa única transação Prisma (seção 1.1 item 4).
      let masterDesignationId: string | null = null;
      if (job.masterIntent !== "NONE" && owner.ownerType === "USER") {
        try {
          const promotion = await this.masterPromotion.promoteAndProject({
            ownerType: "USER",
            userId: owner.userId,
            cvStructuredProfileId: structuredProfile.id,
            masterIntent: job.masterIntent,
            promotedReason:
              job.masterIntent === "PROMOTE_IF_FIRST"
                ? "FIRST_EVER"
                : "EXPLICIT_FLAG",
            canonicalProfile: structuredProfile.canonicalJson as never,
            confidence:
              (structuredProfile.confidenceJson as Record<
                string,
                number
              > | null) ?? {},
            cvSourceId: job.cvSourceId,
          });
          masterDesignationId = promotion.activeDesignation.id;
        } catch (error) {
          if (error instanceof MasterDesignationSubjectMismatchError) {
            // Erro de domínio, recuperável: não derruba a extração nem a
            // captura de talentos (já persistidas) — só a promoção falhou.
            // O job vai a FAILED com essa causa; um retry reavalia do zero.
            throw error;
          }
          throw error;
        }
      } else if (job.masterIntent !== "NONE" && owner.ownerType === "GUEST") {
        // Guest não tem UserProfile/MonitorProjectionJob — só promove a
        // designação em si (sem projeção, sem sync).
        const promotion = await this.masterPromotion.promote({
          ownerType: "GUEST",
          talentSubjectId: owner.talentSubjectId,
          cvStructuredProfileId: structuredProfile.id,
          masterIntent: job.masterIntent,
          promotedReason:
            job.masterIntent === "PROMOTE_IF_FIRST"
              ? "FIRST_EVER"
              : "EXPLICIT_FLAG",
        });
        masterDesignationId = promotion.activeDesignation.id;
      }

      // 4. READY só depois que TUDO acima persistiu de verdade.
      await this.jobService.markReady(job.id, {
        cvStructuredProfileId: structuredProfile.id,
        masterDesignationId,
      });
    } catch (error) {
      this.logger.warn(
        `cv processing job ${job.id} failed (attempt ${job.attempts}/${MAX_CV_PROCESSING_ATTEMPTS}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.jobService.markFailed(job.id, error);
    }
  }

  private async ensureStructuredProfile(cvSourceId: string, text: string) {
    const existingReady = await this.database.cvStructuredProfile.findUnique({
      where: {
        cvSourceId_extractorVersion_schemaVersion: {
          cvSourceId,
          extractorVersion: EXTRACTOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
      },
    });
    if (existingReady?.status === "READY") {
      return existingReady;
    }

    const output = await this.extractionClient.extract({ text });

    return this.database.cvStructuredProfile.upsert({
      where: {
        cvSourceId_extractorVersion_schemaVersion: {
          cvSourceId,
          extractorVersion: EXTRACTOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
      },
      create: {
        cvSourceId,
        extractorVersion: EXTRACTOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
        status: "READY",
        canonicalJson: output.canonicalProfile as never,
        coverageJson: output.extractionCoverage as never,
        confidenceJson: output.confidence as never,
        evidenceJson: output.evidence as never,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
      // Imutável após READY (trigger de Fase 1) — este update só é
      // alcançado quando a linha existente NÃO está READY (PENDING/FAILED
      // de uma tentativa anterior), nunca sobrescreve uma READY.
      update: {
        status: "READY",
        canonicalJson: output.canonicalProfile as never,
        coverageJson: output.extractionCoverage as never,
        confidenceJson: output.confidence as never,
        evidenceJson: output.evidence as never,
        finishedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  }

  private resolveOwner(cvSource: {
    ownerType: "USER" | "GUEST";
    userId: string | null;
    talentSubjectId: string | null;
  }):
    | { ownerType: "USER"; userId: string }
    | { ownerType: "GUEST"; talentSubjectId: string } {
    if (cvSource.ownerType === "USER" && cvSource.userId) {
      return { ownerType: "USER", userId: cvSource.userId };
    }
    if (cvSource.ownerType === "GUEST" && cvSource.talentSubjectId) {
      return { ownerType: "GUEST", talentSubjectId: cvSource.talentSubjectId };
    }
    throw new Error(
      `CvSource ${cvSource.ownerType} sem userId/talentSubjectId consistente`,
    );
  }

  // Leitura idempotente: o mesmo storageKey sempre resolve pro mesmo
  // conteúdo (o objeto é imutável — a chave é determinística pelo hash do
  // texto, plano Fase 2B), então ler duas vezes (ex.: retry após falha na
  // extração) devolve exatamente os mesmos bytes, sem efeito colateral.
  // Objeto ausente vira erro de domínio explícito
  // (CvSourceTextObjectMissingError), nunca uma exceção crua do SDK do S3
  // — markFailed trata isso como qualquer outra falha recuperável
  // (retry até MAX_CV_PROCESSING_ATTEMPTS, depois FAILED com lastError
  // claro para intervenção manual).
  private async readSourceText(cvSource: {
    textStorageKey: string;
  }): Promise<string> {
    try {
      const buffer = await this.storage.getObject(cvSource.textStorageKey);
      return buffer.toString("utf-8");
    } catch (error) {
      if (this.isMissingObjectError(error)) {
        throw new CvSourceTextObjectMissingError(cvSource.textStorageKey);
      }
      throw error;
    }
  }

  private isMissingObjectError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const err = error as {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return (
      err.name === "NoSuchKey" ||
      err.name === "NotFound" ||
      err.Code === "NoSuchKey" ||
      err.$metadata?.httpStatusCode === 404
    );
  }
}
