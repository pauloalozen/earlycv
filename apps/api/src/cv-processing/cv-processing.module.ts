import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";
import { StorageModule } from "../storage/storage.module";
import { TalentSubjectService } from "../talent-subjects/talent-subject.service";
import { CvMasterPromotionService } from "./cv-master-promotion.service";
import { CvProcessingWorker } from "./cv-processing.worker";
import { CvProcessingEntrypointService } from "./cv-processing-entrypoint.service";
import { CvProcessingJobService } from "./cv-processing-job.service";
import { CvProcessingJobsController } from "./cv-processing-jobs.controller";
import { CvStructuredProfileExtractionService } from "./cv-structured-profile-extraction.service";
import { CvTalentCaptureService } from "./cv-talent-capture.service";
import { CvUserProfileSyncService } from "./cv-user-profile-sync.service";

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [CvProcessingJobsController],
  // IngestionLockRepository reinstanciado aqui (mesmo padrão de
  // monitor.module.ts) — stateless, coordena via linha em
  // IngestionSchedulerLock, seguro ter mais de uma instância gerenciada
  // pelo Nest.
  providers: [
    CvProcessingJobService,
    CvStructuredProfileExtractionService,
    CvTalentCaptureService,
    CvUserProfileSyncService,
    CvMasterPromotionService,
    CvProcessingWorker,
    CvProcessingEntrypointService,
    ProfileCanonicalMergeService,
    ProfileReadinessService,
    IngestionLockRepository,
    TalentSubjectService,
  ],
  // CvMasterPromotionService exportado a partir da Fase 2C: cv-adaptation.service
  // (análise autenticada) precisa consultar a designação ativa de Master
  // (getActiveDesignation) pra decidir masterIntent/reusar extração já READY,
  // sem duplicar a lógica de concorrência da seção 10 do plano.
  exports: [
    CvProcessingEntrypointService,
    CvProcessingJobService,
    CvMasterPromotionService,
    TalentSubjectService,
  ],
})
export class CvProcessingModule {}
