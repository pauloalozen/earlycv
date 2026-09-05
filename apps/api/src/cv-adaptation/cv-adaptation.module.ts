import { Module } from "@nestjs/common";
import { AnalysisObservabilityModule } from "../analysis-observability/analysis-observability.module";
import { AnalysisProtectionModule } from "../analysis-protection/analysis-protection.module";
import { createAiClientFromEnv } from "../common/ai-client-factory";
import { CvProcessingModule } from "../cv-processing/cv-processing.module";
import { DatabaseModule } from "../database/database.module";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { JobApplicationsModule } from "../job-applications/job-applications.module";
import { MasterCvCanonicalExtractionModule } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.module";
import { ProfilesModule } from "../profiles/profiles.module";
import { ResumeTemplatesModule } from "../resume-templates/resume-templates.module";
import { TalentProfilesModule } from "../talent-profiles/talent-profiles.module";
import { CvAdaptationController } from "./cv-adaptation.controller";
import { CvAdaptationService } from "./cv-adaptation.service";
import { CvAdaptationAiService } from "./cv-adaptation-ai.service";
import { CvAdaptationDocxService } from "./cv-adaptation-docx.service";
import { CvAdaptationPaymentService } from "./cv-adaptation-payment.service";
import { CvAdaptationPdfService } from "./cv-adaptation-pdf.service";
import { CvAdaptationProtectedAnalyzeService } from "./cv-adaptation-protected-analyze.service";
import { CvAdaptationPublicController } from "./cv-adaptation-public.controller";
import { CvAdaptationSnapshotCleanupScheduler } from "./cv-adaptation-snapshot-cleanup.scheduler";
import { CvAnalysisWorker } from "./cv-analysis.worker";
import { JobCanonicalizationService } from "./job-canonicalization.service";
import { JobRequirementSetsService } from "./job-requirement-sets.service";

@Module({
  imports: [
    DatabaseModule,
    ResumeTemplatesModule,
    AnalysisProtectionModule,
    AnalysisObservabilityModule,
    JobApplicationsModule,
    ProfilesModule,
    TalentProfilesModule,
    // Fase 2C: entrypoint autenticado passa a poder criar
    // CvSource/CvSubmission/CvProcessingJob (CvProcessingEntrypointService)
    // e consultar a designação ativa de Master
    // (CvMasterPromotionService#getActiveDesignation) quando
    // CV_STRUCTURED_PROFILE_PIPELINE_ENABLED=true. Sempre importado (não
    // condicionado à env var, ao contrário de MasterCvCanonicalExtractionModule)
    // porque a checagem da flag acontece em runtime dentro do service, não
    // na composição do módulo — evita reiniciar o processo pra virar a flag.
    CvProcessingModule,
    ...(process.env.MASTER_CV_CANONICAL_EXTRACTION_ENABLED === "true"
      ? [MasterCvCanonicalExtractionModule]
      : []),
  ],
  controllers: [CvAdaptationController, CvAdaptationPublicController],
  exports: [CvAdaptationService, CvAdaptationAiService],
  providers: [
    CvAdaptationService,
    CvAdaptationAiService,
    CvAdaptationPaymentService,
    CvAdaptationPdfService,
    CvAdaptationDocxService,
    CvAdaptationProtectedAnalyzeService,
    CvAdaptationSnapshotCleanupScheduler,
    // CvAnalysisWorker (Fase 2C): processa AnalysisJob do pipeline canônico
    // em ciclo de cron próprio, separado de CvProcessingWorker. Vive aqui
    // (não em CvProcessingModule) porque depende de CvAdaptationService
    // (runCanonicalAuthenticatedAnalysis) — importar CvAdaptationModule em
    // CvProcessingModule criaria um ciclo de módulos.
    CvAnalysisWorker,
    // IngestionLockRepository reinstanciado aqui (mesmo padrão já usado em
    // cv-processing.module.ts/monitor.module.ts) — stateless, coordena via
    // linha em IngestionSchedulerLock, seguro ter mais de uma instância
    // gerenciada pelo Nest.
    IngestionLockRepository,
    JobCanonicalizationService,
    JobRequirementSetsService,
    {
      provide: "CV_ANALYSIS_AI_CLIENT",
      useFactory: () => createAiClientFromEnv("ANALYSIS"),
    },
    {
      provide: "CV_GENERATION_AI_CLIENT",
      useFactory: () => createAiClientFromEnv("CV_GENERATION"),
    },
    {
      provide: "JOB_CANONICALIZATION_AI_CLIENT",
      useFactory: () => createAiClientFromEnv("JOB_CANONICALIZATION"),
    },
  ],
})
export class CvAdaptationModule {}
