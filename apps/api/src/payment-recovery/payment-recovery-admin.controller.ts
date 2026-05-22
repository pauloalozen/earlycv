import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { IgnorePaymentRecoveryDto } from "./dto/ignore-payment-recovery.dto";
import { ListPaymentRecoveryDto } from "./dto/list-payment-recovery.dto";
import { SendPaymentRecoveryEmailDto } from "./dto/send-payment-recovery-email.dto";
import { PaymentRecoveryAdminEventsService } from "./payment-recovery-admin-events.service";
import { PaymentRecoveryConfigService } from "./payment-recovery.config";
import { PaymentRecoveryEmailService } from "./payment-recovery-email.service";
import { PaymentRecoveryEligibilityService } from "./payment-recovery-eligibility.service";
import { PaymentRecoveryIgnoreService } from "./payment-recovery-ignore.service";

const paymentRecoveryValidationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/payment-recovery")
export class PaymentRecoveryAdminController {
  constructor(
    @Inject(PaymentRecoveryEligibilityService)
    private readonly eligibility: PaymentRecoveryEligibilityService,
    @Inject(PaymentRecoveryIgnoreService)
    private readonly ignoreService: PaymentRecoveryIgnoreService,
    @Inject(PaymentRecoveryConfigService)
    private readonly config: PaymentRecoveryConfigService,
    @Inject(PaymentRecoveryAdminEventsService)
    private readonly events: PaymentRecoveryAdminEventsService,
    @Inject(PaymentRecoveryEmailService)
    private readonly emailService: PaymentRecoveryEmailService,
  ) {}

  private assertAdminFeatureEnabled() {
    if (!this.config.isAdminEnabled()) {
      throw new ForbiddenException("payment recovery admin is disabled");
    }
  }

  @Get("pending")
  async listPending(
    @AuthenticatedUser() adminUser: AuthenticatedRequestUser,
    @Query(new ValidationPipe(paymentRecoveryValidationOptions))
    query: ListPaymentRecoveryDto,
  ) {
    this.assertAdminFeatureEnabled();
    const filters = {
      eligibilityStatus: query.eligibilityStatus ?? "eligible",
      originAction: query.originAction ?? "all",
      alreadySent: query.alreadySent ?? "all",
      hasAvailableCredits: query.hasAvailableCredits ?? "all",
      ignored: query.ignored ?? "false",
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    } as const;
    const response = await this.eligibility.listPending(filters);
    this.events.listViewed({ adminUserId: adminUser.id, filters });
    return response;
  }

  @Post(":purchaseId/ignore")
  async ignore(
    @Param("purchaseId") purchaseId: string,
    @AuthenticatedUser() adminUser: AuthenticatedRequestUser,
    @Body(
      new ValidationPipe({
        ...paymentRecoveryValidationOptions,
        expectedType: IgnorePaymentRecoveryDto,
      }),
    )
    body: IgnorePaymentRecoveryDto,
  ) {
    this.assertAdminFeatureEnabled();
    await this.ignoreService.ignore({
      purchaseId,
      ignoredByAdminUserId: adminUser.id,
      reason: body.reason,
    });
    this.events.ignored({
      adminUserId: adminUser.id,
      purchaseId,
      reason: body.reason,
    });
    return { ok: true };
  }

  @Post(":purchaseId/unignore")
  async unignore(
    @Param("purchaseId") purchaseId: string,
    @AuthenticatedUser() adminUser: AuthenticatedRequestUser,
  ) {
    this.assertAdminFeatureEnabled();
    await this.ignoreService.unignore({ purchaseId });
    this.events.unignored({ adminUserId: adminUser.id, purchaseId });
    return { ok: true };
  }

  @Post(":purchaseId/send-email")
  async sendEmail(
    @Param("purchaseId") purchaseId: string,
    @AuthenticatedUser() adminUser: AuthenticatedRequestUser,
    @Body(
      new ValidationPipe({
        ...paymentRecoveryValidationOptions,
        expectedType: SendPaymentRecoveryEmailDto,
      }),
    )
    body: SendPaymentRecoveryEmailDto = {},
  ) {
    this.assertAdminFeatureEnabled();
    const result = await this.emailService.send({
      purchaseId,
      adminUserId: adminUser.id,
      forceResend: body.forceResend === true,
    });
    this.events.emailSendRequested({
      adminUserId: adminUser.id,
      purchaseId,
      eligibilityStatus: result.eligibilityStatus,
      eligibilityReason: result.eligibilityReason,
      ignored: result.reason === "ignored",
      dryRun: result.dryRun,
      allowlistMatched: result.allowlistMatched,
    });
    if (result.status === "failed") {
      this.events.emailFailed({
        adminUserId: adminUser.id,
        purchaseId,
        reason: result.reason,
        errorMessage: result.reason,
        emailRecordId: result.emailRecordId,
      });
    } else if (result.status === "skipped") {
      this.events.emailSkipped({
        adminUserId: adminUser.id,
        purchaseId,
        reason: result.reason,
        dryRun: result.dryRun,
        allowlistMatched: result.allowlistMatched,
        realEmailSent: result.realEmailSent,
      });
    } else {
      this.events.emailSent({
        adminUserId: adminUser.id,
        purchaseId,
        emailRecordId: result.emailRecordId,
        tokenId: "created",
        dryRun: result.dryRun,
        realEmailSent: result.realEmailSent,
      });
    }
    return result;
  }
}
