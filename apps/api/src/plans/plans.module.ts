import { Module } from "@nestjs/common";

import { AnalysisObservabilityModule } from "../analysis-observability/analysis-observability.module";
import { DatabaseModule } from "../database/database.module";
import { PlansController } from "./plans.controller";
import { PlansService } from "./plans.service";

@Module({
  imports: [DatabaseModule, AnalysisObservabilityModule],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
