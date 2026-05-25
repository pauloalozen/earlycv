import { createHash } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { PlansService } from "../plans/plans.service";
import { PaymentRecoveryPublicEventsService } from "./payment-recovery-public-events.service";

@Injectable()
export class PaymentRecoveryResumeService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PlansService) private readonly plansService: PlansService,
    @Inject(PaymentRecoveryPublicEventsService)
    private readonly events: PaymentRecoveryPublicEventsService,
  ) {}

  async resumeCheckoutForToken(input: {
    token: string;
    currentUserId: string;
    ip?: string;
    requestId?: string;
    userAgent?: string;
  }): Promise<{ checkoutUrl: string }> {
    const normalizedToken = input.token.trim();
    if (!/^[a-f0-9]{64}$/i.test(normalizedToken)) {
      throw new NotFoundException("Token invalido.");
    }

    const tokenHash = createHash("sha256")
      .update(normalizedToken)
      .digest("hex");
    const token = await this.database.paymentRecoveryToken.findUnique({
      where: { tokenHash },
    });

    if (!token?.purchaseId || token.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException("Token invalido.");
    }

    const purchase = await this.database.planPurchase.findUnique({
      where: { id: token.purchaseId },
      select: {
        id: true,
        userId: true,
        status: true,
        originAction: true,
        originAdaptationId: true,
      },
    });
    if (!purchase || purchase.userId !== input.currentUserId) {
      this.events.emit("payment_recovery_token_user_mismatch", {
        tokenId: token.id,
        purchaseId: token.purchaseId,
        userId: token.userId,
        adaptationId: token.adaptationId,
        recoveryGroupKey: token.recoveryGroupKey,
        emailRecordId: token.emailRecordId,
        reason: "bridge_ownership_mismatch",
        ip: input.ip ?? null,
        requestId: input.requestId ?? null,
        userAgent: input.userAgent ?? null,
      });
      throw new NotFoundException("Token invalido.");
    }

    const resumed = await this.plansService.resumeCheckout(
      input.currentUserId,
      purchase.id,
    );
    this.events.emit("payment_recovery_checkout_resumed", {
      tokenId: token.id,
      purchaseId: token.purchaseId,
      userId: token.userId,
      adaptationId: token.adaptationId,
      recoveryGroupKey: token.recoveryGroupKey,
      emailRecordId: token.emailRecordId,
      originAction: purchase.originAction,
      purchaseStatus: purchase.status,
      redirectTarget: "checkout",
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
      userAgent: input.userAgent ?? null,
    });
    return resumed;
  }
}
