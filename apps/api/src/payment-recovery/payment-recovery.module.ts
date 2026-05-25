import { Module } from "@nestjs/common";
import { OptionalJwtAuthGuard } from "../common/optional-jwt-auth.guard";
import { DatabaseModule } from "../database/database.module";
import { PlansModule } from "../plans/plans.module";
import { PaymentRecoveryConfigService } from "./payment-recovery.config";
import { PAYMENT_RECOVERY_CONFIG } from "./payment-recovery.types";
import { PaymentRecoveryAdminController } from "./payment-recovery-admin.controller";
import { PaymentRecoveryAdminEventsService } from "./payment-recovery-admin-events.service";
import { PaymentRecoveryClickService } from "./payment-recovery-click.service";
import { PaymentRecoveryEligibilityService } from "./payment-recovery-eligibility.service";
import { PaymentRecoveryEmailService } from "./payment-recovery-email.service";
import { PaymentRecoveryIgnoreService } from "./payment-recovery-ignore.service";
import { PaymentRecoveryPublicController } from "./payment-recovery-public.controller";
import { PaymentRecoveryPublicEventsService } from "./payment-recovery-public-events.service";
import { PaymentRecoveryPublicRateLimitGuard } from "./payment-recovery-public-rate-limit.guard";
import { PaymentRecoveryResumeService } from "./payment-recovery-resume.service";

@Module({
  imports: [DatabaseModule, PlansModule],
  controllers: [
    PaymentRecoveryAdminController,
    PaymentRecoveryPublicController,
  ],
  providers: [
    {
      provide: PAYMENT_RECOVERY_CONFIG,
      useFactory: (configService: PaymentRecoveryConfigService) => {
        return configService.getConfig();
      },
      inject: [PaymentRecoveryConfigService],
    },
    PaymentRecoveryConfigService,
    OptionalJwtAuthGuard,
    PaymentRecoveryAdminEventsService,
    PaymentRecoveryPublicEventsService,
    PaymentRecoveryPublicRateLimitGuard,
    PaymentRecoveryClickService,
    PaymentRecoveryResumeService,
    PaymentRecoveryEmailService,
    PaymentRecoveryEligibilityService,
    PaymentRecoveryIgnoreService,
  ],
  exports: [
    PAYMENT_RECOVERY_CONFIG,
    PaymentRecoveryConfigService,
    PaymentRecoveryEligibilityService,
    PaymentRecoveryIgnoreService,
    PaymentRecoveryEmailService,
  ],
})
export class PaymentRecoveryModule {}
