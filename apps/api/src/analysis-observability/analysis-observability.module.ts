import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AnalysisRetentionScheduler } from "./analysis-retention.scheduler";
import { AnalysisRetentionService } from "./analysis-retention.service";
import { BusinessFunnelEventService } from "./business-funnel-event.service";
import { BusinessFunnelEventsController } from "./business-funnel-events.controller";
import { BusinessFunnelProjectionService } from "./business-funnel-projection.service";

@Module({
  imports: [DatabaseModule],
  controllers: [BusinessFunnelEventsController],
  providers: [
    BusinessFunnelProjectionService,
    BusinessFunnelEventService,
    AnalysisRetentionService,
    AnalysisRetentionScheduler,
  ],
  exports: [
    BusinessFunnelEventService,
    BusinessFunnelProjectionService,
    AnalysisRetentionService,
  ],
})
export class AnalysisObservabilityModule {}
