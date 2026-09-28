import { Module } from "@nestjs/common";

import { AnalysisObservabilityModule } from "../analysis-observability/analysis-observability.module";
import { CvAdaptationModule } from "../cv-adaptation/cv-adaptation.module";
import { DatabaseModule } from "../database/database.module";
import { CouponResolutionService } from "./coupon-resolution.service";
import { PlansController } from "./plans.controller";
import { PlansService } from "./plans.service";

@Module({
  imports: [DatabaseModule, AnalysisObservabilityModule, CvAdaptationModule],
  controllers: [PlansController],
  providers: [PlansService, CouponResolutionService],
  exports: [PlansService, CouponResolutionService],
})
export class PlansModule {}
