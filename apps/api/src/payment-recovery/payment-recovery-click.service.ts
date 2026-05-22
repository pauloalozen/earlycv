import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { PaymentRecoveryPublicEventsService } from "./payment-recovery-public-events.service";

type ClickInput = {
  token: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  currentUserId?: string | null;
  returnUrl?: string | null;
};

type ClickResult = {
  redirectUrl: string;
  redirectTarget: "login" | "checkout" | "completed" | "payment_status" | "generic";
};

@Injectable()
export class PaymentRecoveryClickService {
  private readonly logger = new Logger(PaymentRecoveryClickService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PaymentRecoveryPublicEventsService)
    private readonly events: PaymentRecoveryPublicEventsService,
  ) {}

  async handleTokenClick(input: ClickInput): Promise<ClickResult> {
    try {
      const normalizedToken = input.token.trim();
      if (!/^[a-f0-9]{64}$/i.test(normalizedToken)) {
        this.events.emit("payment_recovery_token_invalid", {
          reason: "invalid_token_format",
          ip: input.ip ?? null,
          requestId: input.requestId ?? null,
          userAgent: input.userAgent ?? null,
        });
        return this.redirectGeneric();
      }

      const tokenHash = createHash("sha256").update(normalizedToken).digest("hex");
      const token = await this.database.paymentRecoveryToken.findUnique({
        where: { tokenHash },
      } as any);
      if (!token || !token.emailRecordId) {
        this.logger.log("[payment-recovery-public] audit token_invalid reason=token_not_found_or_unlinked");
        this.events.emit("payment_recovery_token_invalid", {
          reason: "token_not_found_or_unlinked",
          ip: input.ip ?? null,
          requestId: input.requestId ?? null,
          userAgent: input.userAgent ?? null,
        });
        return this.redirectGeneric();
      }

      const [purchase, user, adaptation, emailRecord] = await Promise.all([
        this.database.planPurchase.findUnique({ where: { id: token.purchaseId } } as any),
        this.database.user.findUnique({ where: { id: token.userId }, select: { id: true } } as any),
        token.adaptationId
          ? this.database.cvAdaptation.findUnique({
              where: { id: token.adaptationId },
              select: { id: true, isUnlocked: true },
            } as any)
          : Promise.resolve(null),
        this.database.paymentRecoveryEmail.findUnique({
          where: { id: token.emailRecordId },
          select: { id: true, clickedAt: true, metadataJson: true },
        } as any),
      ]);

      if (!purchase || !user || !emailRecord) {
        this.logger.log("[payment-recovery-public] audit token_invalid reason=token_linked_records_missing");
        this.events.emit("payment_recovery_token_invalid", {
          reason: "token_linked_records_missing",
          ip: input.ip ?? null,
          requestId: input.requestId ?? null,
          userAgent: input.userAgent ?? null,
        });
        return this.redirectGeneric();
      }

      if (token.expiresAt.getTime() <= Date.now()) {
        this.logger.log(`[payment-recovery-public] audit token_expired tokenId=${token.id}`);
        this.events.emit("payment_recovery_token_expired", {
          tokenId: token.id,
          purchaseId: token.purchaseId,
          userId: token.userId,
          adaptationId: token.adaptationId,
          recoveryGroupKey: token.recoveryGroupKey,
          emailRecordId: token.emailRecordId,
          ip: input.ip ?? null,
          requestId: input.requestId ?? null,
          userAgent: input.userAgent ?? null,
        });
        return this.redirectGeneric();
      }

      const purchaseStatus = purchase.status;
      const unrecoverableStatuses = new Set(["failed", "refunded"]);
      if (unrecoverableStatuses.has(purchaseStatus)) {
        this.emitClicked(token, purchase, input, "terminal_unrecoverable");
        return this.redirectGeneric();
      }

      if (input.currentUserId && input.currentUserId !== token.userId) {
        this.logger.log(
          `[payment-recovery-public] audit token_user_mismatch tokenId=${token.id} currentUser=${input.currentUserId}`,
        );
        this.events.emit("payment_recovery_token_user_mismatch", {
          tokenId: token.id,
          purchaseId: token.purchaseId,
          userId: token.userId,
          adaptationId: token.adaptationId,
          recoveryGroupKey: token.recoveryGroupKey,
          emailRecordId: token.emailRecordId,
          reason: "logged_in_different_user",
          ip: input.ip ?? null,
          requestId: input.requestId ?? null,
          userAgent: input.userAgent ?? null,
        });
        return this.redirectGeneric();
      }

      await this.registerClick(
        token.emailRecordId,
        emailRecord.clickedAt ?? null,
        (emailRecord.metadataJson as Record<string, unknown> | null) ?? null,
      );
      this.emitClicked(token, purchase, input, "clicked");

      if (!input.currentUserId) {
        return {
          redirectTarget: "login",
          redirectUrl: this.loginRedirect(input.returnUrl, normalizedToken),
        };
      }

      if (purchaseStatus === "completed") {
        if (adaptation?.isUnlocked && adaptation.id) {
          const redirectUrl = this.frontendUrl(`/adaptar/resultado?adaptationId=${adaptation.id}`);
          this.events.emit("payment_recovery_click_redirected_completed", {
            tokenId: token.id,
            purchaseId: token.purchaseId,
            userId: token.userId,
            adaptationId: token.adaptationId,
            recoveryGroupKey: token.recoveryGroupKey,
            emailRecordId: token.emailRecordId,
            purchaseStatus,
            redirectTarget: "completed",
          });
          return { redirectTarget: "completed", redirectUrl };
        }

        const redirectUrl = this.frontendUrl(`/pagamento/concluido?checkoutId=${token.purchaseId}`);
        this.events.emit("payment_recovery_click_redirected_completed", {
          tokenId: token.id,
          purchaseId: token.purchaseId,
          userId: token.userId,
          adaptationId: token.adaptationId,
          recoveryGroupKey: token.recoveryGroupKey,
          emailRecordId: token.emailRecordId,
          purchaseStatus,
          redirectTarget: "payment_status",
        });
        return { redirectTarget: "payment_status", redirectUrl };
      }

      if (["pending", "none", "pending_payment", "processing_payment"].includes(purchaseStatus)) {
        return {
          redirectTarget: "checkout",
          redirectUrl: this.frontendUrl(`/api/payment-recovery/bridge/${normalizedToken}`),
        };
      }

      return this.redirectGeneric();
    } catch (error) {
      this.logger.warn(`[payment-recovery-public] click_failed ${(error as Error)?.message ?? "unknown"}`);
      this.events.emit("payment_recovery_click_failed", {
        reason: "unexpected_error",
        ip: input.ip ?? null,
        requestId: input.requestId ?? null,
        userAgent: input.userAgent ?? null,
      });
      return this.redirectGeneric();
    }
  }

  private async registerClick(
    emailRecordId: string,
    clickedAt: Date | null,
    currentMetadata: Record<string, unknown> | null = null,
  ): Promise<void> {
    const now = new Date();
    const mergedMetadata: Record<string, unknown> = {
      ...(currentMetadata ?? {}),
      lastClickedAt: now.toISOString(),
    };
    if (!clickedAt && typeof mergedMetadata.firstClickedAt !== "string") {
      mergedMetadata.firstClickedAt = now.toISOString();
    }
    const metadataUpdate: Record<string, unknown> = {
      metadataJson: {
        set: mergedMetadata,
      },
    };
    await this.database.paymentRecoveryEmail.update({
      where: { id: emailRecordId },
      data: {
        clickedAt: clickedAt ?? now,
        ...metadataUpdate,
      },
    } as any);
  }

  private emitClicked(token: any, purchase: any, input: ClickInput, reason: string): void {
    this.events.emit("payment_recovery_email_clicked", {
      tokenId: token.id,
      purchaseId: token.purchaseId,
      userId: token.userId,
      adaptationId: token.adaptationId,
      recoveryGroupKey: token.recoveryGroupKey,
      emailRecordId: token.emailRecordId,
      originAction: purchase.originAction,
      purchaseStatus: purchase.status,
      reason,
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
      userAgent: input.userAgent ?? null,
    });
  }

  private loginRedirect(returnUrl: string | null | undefined, token: string): string {
    const fallbackPath = `/api/payment-recovery/bridge/${token}`;
    const safeReturn = this.sanitizeInternalPath(returnUrl) ?? fallbackPath;
    return this.frontendUrl(
      `/entrar?tab=entrar&next=${encodeURIComponent(safeReturn)}`,
    );
  }

  private sanitizeInternalPath(value: string | null | undefined): string | null {
    if (!value) return null;
    if (!value.startsWith("/")) return null;
    if (value.startsWith("//")) return null;
    return value;
  }

  private redirectGeneric(): ClickResult {
    return {
      redirectTarget: "generic",
      redirectUrl: this.frontendUrl("/recuperar-pagamento"),
    };
  }

  private frontendUrl(path: string): string {
    const base = process.env.FRONTEND_URL ?? "http://localhost:3000";
    return `${base}${path}`;
  }
}

export type { ClickInput, ClickResult };
