import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { buildPaymentRecoveryEmailCopy } from "./payment-recovery-email-copy";
import { PaymentRecoveryConfigService } from "./payment-recovery.config";
import { PaymentRecoveryEligibilityService } from "./payment-recovery-eligibility.service";

type SendInput = { purchaseId: string; adminUserId: string };

export type SendPaymentRecoveryEmailResult = {
  success: boolean;
  status: "sent" | "skipped" | "failed";
  reason: string;
  dryRun: boolean;
  allowlistMatched: boolean;
  realEmailSent: boolean;
  emailRecordId: string;
  tokenExpiresAt: string;
  eligibilityStatus: "eligible" | "possibly_resolved" | "not_eligible";
  eligibilityReason: string;
};

@Injectable()
export class PaymentRecoveryEmailService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PaymentRecoveryConfigService)
    private readonly config: PaymentRecoveryConfigService,
    @Inject(PaymentRecoveryEligibilityService)
    private readonly eligibility: PaymentRecoveryEligibilityService,
  ) {}

  private computeGroupKey(userId: string, adaptationId: string | null, originAction: string) {
    return adaptationId ? `${userId}:${adaptationId}` : `${userId}:${originAction}`;
  }

  private shouldSendReal(emailEnabled: boolean, dryRun: boolean, allowlistMatched: boolean) {
    if (!emailEnabled) return false;
    if (!dryRun) return allowlistMatched;
    return allowlistMatched;
  }

  private async sendViaResend(to: string, subject: string, text: string) {
    const apiKey = process.env.RESEND_API_KEY ?? "";
    const from = process.env.EMAIL_FROM ?? "EarlyCV <noreply@earlycv.com.br>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      throw new Error(body.message ?? `provider_http_${res.status}`);
    }
    return body.id ?? null;
  }

  async send(input: SendInput): Promise<SendPaymentRecoveryEmailResult> {
    const purchase = await this.database.planPurchase.findUnique({
      where: { id: input.purchaseId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!purchase || !purchase.user?.email) {
      throw new Error("purchase_not_found_or_missing_email");
    }

    const adaptation = purchase.originAdaptationId
      ? await this.database.cvAdaptation.findUnique({
          where: { id: purchase.originAdaptationId },
          select: { id: true, jobTitle: true, adaptedContentJson: true },
        })
      : null;

    const eligibility = await this.eligibility.evaluateByPurchaseId(input.purchaseId);
    const eligibilityItem = eligibility.item;
    const ignored = Boolean(eligibilityItem?.ignored);
    const eligibilityStatus = eligibilityItem?.eligibilityStatus ?? "not_eligible";
    const eligibilityReason = eligibilityItem?.eligibilityReason ?? "missing_purchase";

    const recoveryGroupKey = eligibility.recoveryGroupKey ?? this.computeGroupKey(
      purchase.userId,
      purchase.originAdaptationId,
      purchase.originAction,
    );

    const allowlist = this.config.emailAllowlist();
    const allowlistMatched =
      allowlist.length === 0 || allowlist.includes(purchase.user.email.toLowerCase());
    const dryRun = this.config.isDryRun();
    const emailEnabled = this.config.isEmailEnabled();
    const sendRealWhenAllowed = this.shouldSendReal(
      emailEnabled,
      dryRun,
      allowlistMatched,
    );
    const now = new Date();

    const tokenRaw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");
    const ttlDays = this.config.tokenTtlDays();
    const tokenExpiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const scoreJson = (adaptation?.adaptedContentJson ?? {}) as Record<string, unknown>;
    const firstName = purchase.user.name?.split(" ")[0] ?? null;
    const recoveryLink = `https://earlycv.com.br/recovery/${tokenRaw}`;
    const copy = buildPaymentRecoveryEmailCopy({
      firstName,
      jobTitle: adaptation?.jobTitle ?? null,
      scoreBefore: typeof scoreJson.scoreBefore === "number" ? scoreJson.scoreBefore : null,
      scoreAfter: typeof scoreJson.scoreAfter === "number" ? scoreJson.scoreAfter : null,
      scoreDelta: typeof scoreJson.scoreDelta === "number" ? scoreJson.scoreDelta : null,
      recoveryLink,
    });

    const txResult = await this.database.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        recoveryGroupKey,
      );

      const priorGroupEmails = await tx.paymentRecoveryEmail.findMany({
        where: { recoveryGroupKey },
        orderBy: { createdAt: "desc" },
      });

      const cooldownStart = new Date(now.getTime() - 10 * 60 * 1000);
      const hasCooldown = priorGroupEmails.some((row: any) => row.createdAt >= cooldownStart);
      const hasRealSent = priorGroupEmails.some((row: any) => row.realEmailSent === true);

      let reason = "ok";
      if (ignored) reason = "ignored";
      else if (eligibilityStatus !== "eligible") reason = eligibilityReason;
      else if (hasRealSent) reason = "already_sent";
      else if (hasCooldown) reason = "cooldown_active";
      else if (!emailEnabled) reason = "email_disabled";
      else if (!allowlistMatched) reason = "allowlist_blocked";

      const token = await tx.paymentRecoveryToken.create({
        data: {
          purchaseId: purchase.id,
          userId: purchase.userId,
          adaptationId: purchase.originAdaptationId,
          recoveryGroupKey,
          tokenHash,
          expiresAt: tokenExpiresAt,
        },
      });

      const willSendReal = reason === "ok" && sendRealWhenAllowed;
      const emailRecord = await tx.paymentRecoveryEmail.create({
        data: {
          purchaseId: purchase.id,
          userId: purchase.userId,
          adaptationId: purchase.originAdaptationId,
          recoveryGroupKey,
          sentByAdminUserId: input.adminUserId,
          status: willSendReal ? "sent" : "skipped",
          dryRun,
          allowlistMatched,
          realEmailSent: willSendReal,
          providerMessageId: null,
          errorMessage: reason === "ok" ? null : reason,
          subject: copy.subject,
          preheader: copy.preheader,
          templateVariables: copy.templateVariables,
          tokenId: token.id,
        },
      });

      await tx.paymentRecoveryToken.update({
        where: { id: token.id },
        data: { emailRecordId: emailRecord.id },
      });

      return { reason, emailRecord, willSendReal };
    });

    if (txResult.reason !== "ok" || !txResult.willSendReal) {
      return {
        success: true,
        status: "skipped",
        reason: txResult.reason,
        dryRun,
        allowlistMatched,
        realEmailSent: false,
        emailRecordId: txResult.emailRecord.id,
        tokenExpiresAt: tokenExpiresAt.toISOString(),
        eligibilityStatus,
        eligibilityReason,
      };
    }

    try {
      const providerMessageId = await this.sendViaResend(
        purchase.user.email,
        copy.subject,
        copy.text,
      );
      await this.database.paymentRecoveryEmail.update({
        where: { id: txResult.emailRecord.id },
        data: {
          sentAt: now,
          providerMessageId,
          status: "sent",
          errorMessage: null,
        },
      } as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : "provider_error";
      await this.database.paymentRecoveryEmail.update({
        where: { id: txResult.emailRecord.id },
        data: {
          status: "failed",
          errorMessage: message,
          realEmailSent: false,
        },
      } as any);
      return {
        success: false,
        status: "failed",
        reason: "provider_failure",
        dryRun,
        allowlistMatched,
        realEmailSent: false,
        emailRecordId: txResult.emailRecord.id,
        tokenExpiresAt: tokenExpiresAt.toISOString(),
        eligibilityStatus,
        eligibilityReason,
      };
    }

    return {
      success: true,
      status: "sent",
      reason: "sent",
      dryRun,
      allowlistMatched,
      realEmailSent: true,
      emailRecordId: txResult.emailRecord.id,
      tokenExpiresAt: tokenExpiresAt.toISOString(),
      eligibilityStatus,
      eligibilityReason,
    };
  }
}
