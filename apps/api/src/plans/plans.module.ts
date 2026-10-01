import { Module } from "@nestjs/common";

import { AnalysisObservabilityModule } from "../analysis-observability/analysis-observability.module";
import { CvAdaptationModule } from "../cv-adaptation/cv-adaptation.module";
import { DatabaseModule } from "../database/database.module";
import { EmailDispatchModule } from "../email-dispatch/email-dispatch.module";
import { CouponResolutionService } from "./coupon-resolution.service";
import { PlansController } from "./plans.controller";
import { PlansService } from "./plans.service";
import { PurchaseConfirmationRecoveryService } from "./purchase-confirmation-recovery.service";

@Module({
  imports: [
    DatabaseModule,
    AnalysisObservabilityModule,
    CvAdaptationModule,
    EmailDispatchModule,
  ],
  controllers: [PlansController],
  providers: [
    PlansService,
    CouponResolutionService,
    PurchaseConfirmationRecoveryService,
  ],
  exports: [
    PlansService,
    CouponResolutionService,
    // Detecção/recuperação de confirmações de compra perdidas (aba admin Emails).
    PurchaseConfirmationRecoveryService,
  ],
})
export class PlansModule {}
