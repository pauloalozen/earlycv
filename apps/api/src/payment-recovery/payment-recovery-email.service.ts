import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { PaymentRecoveryConfigService } from "./payment-recovery.config";
import { PaymentRecoveryEligibilityService } from "./payment-recovery-eligibility.service";
import { buildPaymentRecoveryEmailCopy } from "./payment-recovery-email-copy";

type SendInput = {
  purchaseId: string;
  adminUserId: string;
  forceResend?: boolean;
};

type TxEmailRow = {
  createdAt: Date;
  realEmailSent: boolean;
};

export type SendPaymentRecoveryTestEmailResult = {
  status: "sent" | "failed";
  to: string;
  subject: string;
  mockedLocally: boolean;
  providerMessageId: string | null;
  errorMessage: string | null;
  // O que um envio real (por pedido) faria neste ambiente com a config atual.
  realSendWouldBe: "sent" | "email_disabled" | "dry_run" | "allowlist_blocked";
  config: {
    emailEnabled: boolean;
    dryRun: boolean;
    allowlistSize: number;
    toInAllowlist: boolean;
    from: string;
    frontendUrl: string;
  };
};

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
  private readonly logger = new Logger(PaymentRecoveryEmailService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PaymentRecoveryConfigService)
    private readonly config: PaymentRecoveryConfigService,
    @Inject(PaymentRecoveryEligibilityService)
    private readonly eligibility: PaymentRecoveryEligibilityService,
  ) {}

  private computeGroupKey(
    userId: string,
    adaptationId: string | null,
    originAction: string,
  ) {
    return adaptationId
      ? `${userId}:${adaptationId}`
      : `${userId}:${originAction}`;
  }

  private shouldSendReal(
    emailEnabled: boolean,
    dryRun: boolean,
    allowlistMatched: boolean,
  ) {
    if (!emailEnabled) return false;
    if (dryRun) return false;
    return allowlistMatched;
  }

  private emailFrom() {
    return process.env.EMAIL_FROM ?? "EarlyCV <contato@earlycv.com.br>";
  }

  private isLocalEnv() {
    const frontendUrl = process.env.FRONTEND_URL ?? "";
    const apiUrl = process.env.API_URL ?? "";
    const appEnv = process.env.APP_ENV ?? "";
    return (
      process.env.NODE_ENV !== "production" ||
      appEnv === "development" ||
      frontendUrl.includes("localhost") ||
      apiUrl.includes("localhost")
    );
  }

  private async sendViaResend(
    to: string,
    subject: string,
    text: string,
    html: string,
  ) {
    const apiKey = process.env.RESEND_API_KEY ?? "";
    const from = this.emailFrom();

    if (this.isLocalEnv()) {
      const mockMessageId = `mock-local-${Date.now()}`;
      this.logger.log(
        `[payment-recovery-email-mock] from="${from}" to="${to}" subject="${subject}" messageId=${mockMessageId}`,
      );
      console.info(
        `\n📧 [payment-recovery-email-mock] de=${from} para=${to} assunto="${subject}"\n  texto: ${text}\n`,
      );
      return mockMessageId;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new Error(body.message ?? `provider_http_${res.status}`);
    }
    return body.id ?? null;
  }

  async send(input: SendInput): Promise<SendPaymentRecoveryEmailResult> {
    const forceResend = input.forceResend === true;

    const purchase = await this.database.planPurchase.findUnique({
      where: { id: input.purchaseId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!purchase?.user?.email) {
      throw new Error("purchase_not_found_or_missing_email");
    }

    const adaptation = purchase.originAdaptationId
      ? await this.database.cvAdaptation.findUnique({
          where: { id: purchase.originAdaptationId },
          select: { id: true, jobTitle: true, adaptedContentJson: true },
        })
      : null;

    const eligibility = await this.eligibility.evaluateByPurchaseId(
      input.purchaseId,
    );
    const eligibilityItem = eligibility.item;
    const ignored = Boolean(eligibilityItem?.ignored);
    const eligibilityStatus =
      eligibilityItem?.eligibilityStatus ?? "not_eligible";
    const eligibilityReason =
      eligibilityItem?.eligibilityReason ?? "missing_purchase";

    const recoveryGroupKey =
      eligibility.recoveryGroupKey ??
      this.computeGroupKey(
        purchase.userId,
        purchase.originAdaptationId,
        purchase.originAction,
      );

    const allowlist = this.config.emailAllowlist();
    const allowlistMatched =
      allowlist.length === 0 ||
      allowlist.includes(purchase.user.email.toLowerCase());
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
    const tokenExpiresAt = new Date(
      now.getTime() + ttlDays * 24 * 60 * 60 * 1000,
    );

    const scoreJson = (adaptation?.adaptedContentJson ?? {}) as Record<
      string,
      unknown
    >;
    const firstName = purchase.user.name?.split(" ")[0] ?? null;
    const frontendUrl = process.env.FRONTEND_URL ?? "https://earlycv.com.br";
    const recoveryLink = `${frontendUrl}/recovery/${tokenRaw}`;
    const copy = buildPaymentRecoveryEmailCopy({
      firstName,
      jobTitle: adaptation?.jobTitle ?? null,
      scoreBefore:
        typeof scoreJson.scoreBefore === "number"
          ? scoreJson.scoreBefore
          : null,
      scoreAfter:
        typeof scoreJson.scoreAfter === "number" ? scoreJson.scoreAfter : null,
      scoreDelta:
        typeof scoreJson.scoreDelta === "number" ? scoreJson.scoreDelta : null,
      recoveryLink,
    });

    const txResult = await this.database.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        recoveryGroupKey,
      );

      const priorGroupEmails = await tx.paymentRecoveryEmail.findMany({
        where: { recoveryGroupKey },
        orderBy: { createdAt: "desc" },
      });

      const cooldownStart = new Date(now.getTime() - 10 * 60 * 1000);
      const hasCooldown = (priorGroupEmails as TxEmailRow[]).some(
        (row) => row.createdAt >= cooldownStart,
      );
      const hasRealSent = (priorGroupEmails as TxEmailRow[]).some(
        (row) => row.realEmailSent === true,
      );

      let reason = "ok";
      if (ignored) reason = "ignored";
      else if (eligibilityStatus !== "eligible") reason = eligibilityReason;
      else if (!forceResend && hasRealSent) reason = "already_sent";
      else if (!forceResend && hasCooldown) reason = "cooldown_active";
      else if (!emailEnabled) reason = "email_disabled";
      else if (dryRun) reason = "dry_run";
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
        copy.html,
      );
      await this.database.paymentRecoveryEmail.update({
        where: { id: txResult.emailRecord.id },
        data: {
          sentAt: now,
          providerMessageId,
          status: "sent",
          errorMessage: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "provider_error";
      await this.database.paymentRecoveryEmail.update({
        where: { id: txResult.emailRecord.id },
        data: {
          status: "failed",
          errorMessage: message,
          realEmailSent: false,
        },
      });
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

  /**
   * Envio de teste: mesmo template e mesmo caminho de provider (sendViaResend)
   * do envio real, mas com dados fictícios e para um destinatário digitado pelo
   * admin. Não usa dados de cliente, não cria token nem registro de envio, e
   * ignora as travas de email_enabled/dry_run/allowlist (que são reportadas em
   * `realSendWouldBe` para diagnosticar o envio real).
   */
  async sendTest(input: {
    to: string;
    adminUserId: string;
  }): Promise<SendPaymentRecoveryTestEmailResult> {
    const to = input.to.trim().toLowerCase();
    const emailEnabled = this.config.isEmailEnabled();
    const dryRun = this.config.isDryRun();
    const allowlist = this.config.emailAllowlist();
    const toInAllowlist = allowlist.length === 0 || allowlist.includes(to);
    const realSendWouldBe = !emailEnabled
      ? "email_disabled"
      : dryRun
        ? "dry_run"
        : !toInAllowlist
          ? "allowlist_blocked"
          : "sent";

    const frontendUrl = process.env.FRONTEND_URL ?? "https://earlycv.com.br";
    // Token no mesmo formato do real, mas não persistido: o link abre a página
    // genérica de recuperação em vez de retomar um pedido.
    const recoveryLink = `${frontendUrl}/recovery/${randomBytes(32).toString("hex")}`;
    const copy = buildPaymentRecoveryEmailCopy({
      firstName: "Teste",
      jobTitle: "Analista de Dados (exemplo)",
      scoreBefore: 42,
      scoreAfter: 78,
      scoreDelta: 36,
      recoveryLink,
    });
    const subject = `[TESTE] ${copy.subject}`;

    const base = {
      to,
      subject,
      mockedLocally: this.isLocalEnv(),
      realSendWouldBe,
      config: {
        emailEnabled,
        dryRun,
        allowlistSize: allowlist.length,
        toInAllowlist,
        from: this.emailFrom(),
        frontendUrl,
      },
    } as const;

    this.logger.log(
      `[payment-recovery-test-email] admin=${input.adminUserId} to=${to} realSendWouldBe=${realSendWouldBe}`,
    );

    try {
      const providerMessageId = await this.sendViaResend(
        to,
        subject,
        copy.text,
        copy.html,
      );
      return {
        ...base,
        status: "sent",
        providerMessageId,
        errorMessage: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "provider_error";
      this.logger.warn(
        `[payment-recovery-test-email] provider failure to=${to}: ${errorMessage}`,
      );
      return {
        ...base,
        status: "failed",
        providerMessageId: null,
        errorMessage,
      };
    }
  }
}
