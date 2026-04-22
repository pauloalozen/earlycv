import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { BusinessFunnelEventService } from "./business-funnel-event.service";
import { BusinessFunnelEventsController } from "./business-funnel-events.controller";
import { BusinessFunnelProjectionService } from "./business-funnel-projection.service";

@Module({
  imports: [DatabaseModule],
  controllers: [BusinessFunnelEventsController],
  providers: [BusinessFunnelProjectionService, BusinessFunnelEventService],
  exports: [BusinessFunnelEventService, BusinessFunnelProjectionService],
})
export class AnalysisObservabilityModule {}
