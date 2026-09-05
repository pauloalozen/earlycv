import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";
import { StorageModule } from "../storage/storage.module";
import { TalentSubjectService } from "../talent-subjects/talent-subject.service";
import { ClaimSourceGrantService } from "./claim-source-grant.service";
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
    ClaimSourceGrantService,
  ],
  // CvMasterPromotionService exportado a partir da Fase 2C: cv-adaptation.service
  // (análise autenticada) precisa consultar a designação ativa de Master
  // (getActiveDesignation) pra decidir masterIntent/reusar extração já READY,
  // sem duplicar a lógica de concorrência da seção 10 do plano.
  // ClaimSourceGrantService exportado a partir da Fase 2E: cv-adaptation.service
  // (claimGuestAnalysisJob) o usa condicionalmente (flag ligada + AnalysisJob
  // com cvProcessingJobId) pra rodar o claim granular por fonte, sem duplicar
  // a lógica de verificação de token/ownership do claim legado.
  // CvUserProfileSyncService exportado a partir da correção da Fase 2F: já
  // era injetado diretamente (não @Optional) por CvAnalysisWorker
  // (cv-adaptation/cv-analysis.worker.ts, criado na Fase 2C) sem estar na
  // lista de exports — bug de DI real que quebrava o boot de QUALQUER teste
  // (e, potencialmente, do processo real) que instanciasse CvAdaptationModule,
  // já que CvAnalysisWorker é um provider sempre instanciado ali (não
  // condicionado à flag). Achado ao rodar a suíte completa do módulo nesta
  // fase — não é um problema pré-existente isolado a um único
  // e2e-spec (ver nota no commit da Fase 2E, que citava só
  // guest-auth-gate-rollback.e2e-spec.ts).
  exports: [
    CvProcessingEntrypointService,
    CvProcessingJobService,
    CvMasterPromotionService,
    TalentSubjectService,
    ClaimSourceGrantService,
    CvUserProfileSyncService,
  ],
})
export class CvProcessingModule {}
