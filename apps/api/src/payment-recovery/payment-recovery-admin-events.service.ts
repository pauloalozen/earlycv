import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class PaymentRecoveryAdminEventsService {
  private readonly logger = new Logger(PaymentRecoveryAdminEventsService.name);

  listViewed(input: { adminUserId: string; filters: Record<string, unknown> }) {
    this.logger.log(
      `[admin-payment-recovery] list_viewed adminUserId=${input.adminUserId} filters=${JSON.stringify(input.filters)}`,
    );
  }

  ignored(input: { adminUserId: string; purchaseId: string; reason?: string }) {
    this.logger.log(
      `[admin-payment-recovery] ignored adminUserId=${input.adminUserId} purchaseId=${input.purchaseId} reason=${input.reason ?? ""}`,
    );
  }

  unignored(input: { adminUserId: string; purchaseId: string }) {
    this.logger.log(
      `[admin-payment-recovery] unignored adminUserId=${input.adminUserId} purchaseId=${input.purchaseId}`,
    );
  }

  emailSendRequested(input: {
    adminUserId: string;
    purchaseId: string;
    eligibilityStatus: string;
    eligibilityReason: string;
    ignored: boolean;
    dryRun: boolean;
    allowlistMatched: boolean;
  }) {
    this.logger.log(
      `[admin-payment-recovery] payment_recovery_email_send_requested adminUserId=${input.adminUserId} purchaseId=${input.purchaseId} eligibilityStatus=${input.eligibilityStatus} eligibilityReason=${input.eligibilityReason} ignored=${input.ignored} dryRun=${input.dryRun} allowlistMatched=${input.allowlistMatched}`,
    );
  }

  emailSent(input: {
    adminUserId: string;
    purchaseId: string;
    emailRecordId: string;
    tokenId: string;
    dryRun: boolean;
    realEmailSent: boolean;
  }) {
    this.logger.log(
      `[admin-payment-recovery] payment_recovery_email_sent adminUserId=${input.adminUserId} purchaseId=${input.purchaseId} emailRecordId=${input.emailRecordId} tokenId=${input.tokenId} dryRun=${input.dryRun} realEmailSent=${input.realEmailSent}`,
    );
  }

  emailSkipped(input: {
    adminUserId: string;
    purchaseId: string;
    reason: string;
    dryRun: boolean;
    allowlistMatched: boolean;
    realEmailSent: boolean;
  }) {
    this.logger.log(
      `[admin-payment-recovery] payment_recovery_email_skipped adminUserId=${input.adminUserId} purchaseId=${input.purchaseId} reason=${input.reason} dryRun=${input.dryRun} allowlistMatched=${input.allowlistMatched} realEmailSent=${input.realEmailSent}`,
    );
  }

  emailFailed(input: {
    adminUserId: string;
    purchaseId: string;
    reason: string;
    errorMessage: string;
    emailRecordId?: string;
  }) {
    this.logger.error(
      `[admin-payment-recovery] payment_recovery_email_failed adminUserId=${input.adminUserId} purchaseId=${input.purchaseId} reason=${input.reason} emailRecordId=${input.emailRecordId ?? ""} errorMessage=${input.errorMessage}`,
    );
  }
}
