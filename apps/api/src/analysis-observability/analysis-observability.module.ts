import { Module } from "@nestjs/common";
import { AnalysisTelemetryService } from "../analysis-protection/analysis-telemetry.service";
import { RolesGuard } from "../common/roles.guard";
import { DatabaseModule } from "../database/database.module";
import { AdminEventsController } from "./admin-events.controller";
import { AdminEventsEmitterService } from "./admin-events-emitter.service";
import { AnalysisRetentionScheduler } from "./analysis-retention.scheduler";
import { AnalysisRetentionService } from "./analysis-retention.service";
import { BusinessFunnelEventService } from "./business-funnel-event.service";
import { BusinessFunnelEventsController } from "./business-funnel-events.controller";
import { BusinessFunnelProjectionService } from "./business-funnel-projection.service";

@Module({
  imports: [DatabaseModule],
  controllers: [BusinessFunnelEventsController, AdminEventsController],
  providers: [
    BusinessFunnelProjectionService,
    BusinessFunnelEventService,
    AdminEventsEmitterService,
    AnalysisTelemetryService,
    RolesGuard,
    AnalysisRetentionService,
    AnalysisRetentionScheduler,
  ],
  exports: [
    BusinessFunnelEventService,
    BusinessFunnelProjectionService,
    AdminEventsEmitterService,
    AnalysisRetentionService,
  ],
})
export class AnalysisObservabilityModule {}
