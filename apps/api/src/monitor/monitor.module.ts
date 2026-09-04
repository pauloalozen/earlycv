import { Module } from "@nestjs/common";

import { AnalysisObservabilityModule } from "../analysis-observability/analysis-observability.module";
import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { JobApplicationsModule } from "../job-applications/job-applications.module";
import { RadarModule } from "../radar/radar.module";
import { SavedJobsModule } from "../saved-jobs/saved-jobs.module";
import { MonitorController } from "./monitor.controller";
import { MonitorAccessController } from "./monitor-access.controller";
import { MonitorAlertPreferenceService } from "./monitor-alert-preference.service";
import { MonitorDigestScheduler } from "./monitor-digest.scheduler";
import { MonitorDigestWorker } from "./monitor-digest.worker";
import { MonitorDigestContentService } from "./monitor-digest-content.service";
import { MonitorDigestEmailService } from "./monitor-digest-email.service";
import { MonitorDigestWebhookService } from "./monitor-digest-webhook.service";
import { MonitorEntitlementGuard } from "./monitor-entitlement.guard";
import { MonitorEntitlementService } from "./monitor-entitlement.service";
import { MonitorMatchingWorker } from "./monitor-matching.worker";
import { MonitorNotificationsService } from "./monitor-notifications.service";
import { MonitorProfileMatchService } from "./monitor-profile-match.service";
import { MonitorProfileMatchingWorker } from "./monitor-profile-matching.worker";
import { MonitorPublicController } from "./monitor-public.controller";
import { MonitorRecommendationsService } from "./monitor-recommendations.service";

@Module({
  imports: [
    DatabaseModule,
    RadarModule,
    JobApplicationsModule,
    SavedJobsModule,
    AnalysisObservabilityModule,
    EmailModule,
  ],
  controllers: [
    MonitorController,
    MonitorAccessController,
    MonitorPublicController,
  ],
  // IngestionLockRepository é reinstanciado aqui (não importado via
  // IngestionModule, que não o exporta) — é stateless, coordena o lock via
  // linha em IngestionSchedulerLock no banco, então uma segunda instância
  // gerenciada pelo Nest é equivalente à usada por JobEnrichmentWorker.
  providers: [
    MonitorRecommendationsService,
    MonitorNotificationsService,
    MonitorMatchingWorker,
    MonitorProfileMatchService,
    MonitorProfileMatchingWorker,
    MonitorAlertPreferenceService,
    MonitorDigestContentService,
    MonitorDigestEmailService,
    MonitorDigestScheduler,
    MonitorDigestWorker,
    MonitorDigestWebhookService,
    MonitorEntitlementService,
    MonitorEntitlementGuard,
    IngestionLockRepository,
  ],
  exports: [
    MonitorRecommendationsService,
    MonitorProfileMatchService,
    MonitorEntitlementService,
    MonitorAlertPreferenceService,
    MonitorDigestContentService,
    MonitorDigestEmailService,
  ],
})
export class MonitorModule {}
