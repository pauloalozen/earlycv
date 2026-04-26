import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Prisma, UserPlanType } from "@prisma/client";
import MercadoPagoConfig, { Payment, Preference } from "mercadopago";

import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import { DatabaseService } from "../database/database.service";

type PlanId = "starter" | "pro" | "turbo";

type MercadoPagoPaymentResolution = {
  paymentReference: string | null;
  status: "approved" | "failed" | "pending" | "unknown";
  paymentId: string | null;
  merchantOrderId: string | null;
  preferenceId: string | null;
  rawStatus: string | null;
};

type AuditEntry = {
  eventType: string;
  actionTaken: string;
  mpPaymentId?: string | null;
  mpMerchantOrderId?: string | null;
  mpPreferenceId?: string | null;
  externalReference?: string | null;
  internalCheckoutId?: string | null;
  internalCheckoutType?: string;
  mpStatus?: string | null;
  errorMessage?: string | null;
  rawPayload?: object | null;
};

const PLAN_CONFIG: Record<
  PlanId,
  {
    label: string;
    amountInCents: number;
    downloadCreditsGranted: number;
    analysisCreditsGranted: number;
  }
> = {
  starter: {
    label: `${process.env.QNT_CV_PLAN_STARTER ?? "1"} CV Otimizado — EarlyCV`,
    amountInCents: parseInt(process.env.PRICE_PLAN_STARTER ?? "1190", 10),
    downloadCreditsGranted: parseInt(
      process.env.QNT_CV_PLAN_STARTER ?? "1",
      10,
    ),
    analysisCreditsGranted: parseInt(
      process.env.QNT_AN_CREDIT_PLAN_STARTER ??
        process.env.QNT_AN_PLAN_STARTER ??
        "6",
      10,
    ),
  },
  pro: {
    label: `${process.env.QNT_CV_PLAN_PRO ?? "3"} CVs Otimizados — EarlyCV`,
    amountInCents: parseInt(process.env.PRICE_PLAN_PRO ?? "2990", 10),
    downloadCreditsGranted: parseInt(process.env.QNT_CV_PLAN_PRO ?? "3", 10),
    analysisCreditsGranted: parseInt(
      process.env.QNT_AN_CREDIT_PLAN_PRO ?? process.env.QNT_AN_PLAN_PRO ?? "9",
      10,
    ),
  },
  turbo: {
    label: `${process.env.QNT_CV_PLAN_TURBO ?? "10"} CVs Otimizados — EarlyCV`,
    amountInCents: parseInt(process.env.PRICE_PLAN_TURBO ?? "5990", 10),
    downloadCreditsGranted: parseInt(process.env.QNT_CV_PLAN_TURBO ?? "10", 10),
    analysisCreditsGranted: parseInt(
      process.env.QNT_AN_CREDIT_PLAN_TURBO ??
        process.env.QNT_AN_PLAN_TURBO ??
        "30",
      10,
    ),
  },
};

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(BusinessFunnelEventService)
    private readonly businessFunnelEventService: BusinessFunnelEventService,
  ) {}

  async createCheckout(
    userId: string,
    planId: PlanId,
    adaptationId?: string,
  ): Promise<{ checkoutUrl: string; purchaseId: string }> {
    const plan = PLAN_CONFIG[planId];
    const paymentReference = randomUUID();

    const purchase = await this.database.planPurchase.create({
      data: {
        userId,
        planType: planId as UserPlanType,
        amountInCents: plan.amountInCents,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        creditsGranted: plan.downloadCreditsGranted,
        analysisCreditsGranted: plan.analysisCreditsGranted,
      },
    });

    const checkoutUrl = await this.createMercadoPagoPreference(
      purchase.id,
      paymentReference,
      plan,
      adaptationId,
    );

    return { checkoutUrl, purchaseId: purchase.id };
  }

  async getPlanInfo(userId: string) {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: {
        internalRole: true,
        planType: true,
        creditsRemaining: true,
        planExpiresAt: true,
      },
    });

    if (!user) throw new NotFoundException("user not found");

    if (user.internalRole === "superadmin") {
      return {
        planType: "unlimited",
        creditsRemaining: null,
        planExpiresAt: null,
        isActive: true,
      };
    }

    const isUnlimited = user.planType === "unlimited";
    const isExpired =
      isUnlimited &&
      user.planExpiresAt !== null &&
      user.planExpiresAt < new Date();
    const effectivePlanType = isExpired ? "free" : user.planType;

    return {
      planType: effectivePlanType,
      creditsRemaining:
        isUnlimited && !isExpired ? null : user.creditsRemaining,
      planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
      isActive: user.planType !== "free" && !isExpired,
    };
  }

  verifyWebhookSignature(
    provider: string,
    body: unknown,
    xSignature?: string,
    xRequestId?: string,
  ): void {
    if (provider !== "mercadopago") return;

    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (!secret) return; // dev: sem secret configurado, aceita sem validar

    if (!xSignature) {
      this.logAuditEvent({
        eventType: "webhook_received",
        actionTaken: "invalid_signature",
        errorMessage: "Missing x-signature header",
        rawPayload: body as object,
      });
      throw new UnauthorizedException("Missing webhook signature");
    }

    const parts: Record<string, string> = {};
    for (const part of xSignature.split(",")) {
      const [k, v] = part.split("=");
      if (k && v) parts[k.trim()] = v.trim();
    }
    const ts = parts.ts;
    const v1 = parts.v1;

    if (!ts || !v1) {
      this.logAuditEvent({
        eventType: "webhook_received",
        actionTaken: "invalid_signature",
        errorMessage: "Invalid x-signature format",
        rawPayload: body as object,
      });
      throw new UnauthorizedException("Invalid webhook signature format");
    }

    const dataId =
      body !== null &&
      typeof body === "object" &&
      "data" in body &&
      body.data !== null &&
      typeof body.data === "object" &&
      "id" in body.data
        ? String((body.data as { id: unknown }).id)
        : "";

    const message = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts};`;
    const expected = createHmac("sha256", secret).update(message).digest("hex");

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(v1);

    if (
      expectedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      this.logAuditEvent({
        eventType: "webhook_received",
        actionTaken: "invalid_signature",
        errorMessage: "HMAC mismatch",
        rawPayload: body as object,
      });
      throw new UnauthorizedException("Invalid webhook signature");
    }
  }

  async handleWebhook(provider: string, body: unknown): Promise<void> {
    if (provider !== "mercadopago") {
      throw new BadRequestException(`Provider ${provider} not supported`);
    }

    this.logger.log(`[webhook:plans] received`);

    let resolution: MercadoPagoPaymentResolution;
    try {
      resolution = await this.resolveMercadoPagoPayment(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[webhook:plans] error resolving payment: ${msg}`);
      this.logAuditEvent({
        eventType: "unexpected_error",
        actionTaken: "error",
        errorMessage: msg,
        rawPayload: body as object,
      });
      return; // return 200 to prevent MP from retrying indefinitely
    }

    if (!resolution.paymentReference) {
      this.logger.log(`[webhook:plans] ignored — no payment reference`);
      this.logAuditEvent({
        eventType: "webhook_received",
        actionTaken: "ignored",
        mpPaymentId: resolution.paymentId,
        mpStatus: resolution.rawStatus,
        rawPayload: body as object,
      });
      return;
    }

    const auditBase = {
      mpPaymentId: resolution.paymentId,
      mpMerchantOrderId: resolution.merchantOrderId,
      mpPreferenceId: resolution.preferenceId,
      externalReference: resolution.paymentReference,
      internalCheckoutType: "plan",
      mpStatus: resolution.rawStatus,
      rawPayload: body as object,
    };

    if (resolution.status === "failed") {
      const purchase = await this.database.planPurchase.findUnique({
        where: { paymentReference: resolution.paymentReference },
      });

      if (
        purchase &&
        purchase.status !== "completed" &&
        purchase.status !== "failed"
      ) {
        await this.database.planPurchase.update({
          where: { id: purchase.id },
          data: {
            status: "failed",
            ...(!purchase.mpPaymentId && resolution.paymentId
              ? { mpPaymentId: resolution.paymentId }
              : {}),
            ...(!purchase.mpMerchantOrderId && resolution.merchantOrderId
              ? { mpMerchantOrderId: resolution.merchantOrderId }
              : {}),
          },
        });
        this.logger.log(
          `[webhook:plans] payment failed — purchase ${purchase.id}`,
        );
      }

      await this.recordPaymentFailed(resolution.paymentReference);
      this.logAuditEvent({
        ...auditBase,
        eventType: "payment_rejected",
        actionTaken: "failed",
        internalCheckoutId: purchase?.id ?? null,
      });
      return;
    }

    if (resolution.status !== "approved") {
      this.logger.log(
        `[webhook:plans] ignored — status is ${resolution.rawStatus}`,
      );
      const purchase = await this.database.planPurchase.findUnique({
        where: { paymentReference: resolution.paymentReference },
      });
      this.logAuditEvent({
        ...auditBase,
        eventType: "payment_pending",
        actionTaken: "pending",
        internalCheckoutId: purchase?.id ?? null,
      });
      return;
    }

    const purchase = await this.database.planPurchase.findUnique({
      where: { paymentReference: resolution.paymentReference },
    });

    if (!purchase) {
      this.logger.warn(
        `[webhook:plans] unknown paymentReference: ${resolution.paymentReference}`,
      );
      this.logAuditEvent({
        ...auditBase,
        eventType: "webhook_received",
        actionTaken: "ignored",
        errorMessage: "purchase not found for external_reference",
      });
      return;
    }

    if (purchase.status === "completed") {
      this.logger.log(
        `[webhook:plans] already processed — purchase ${purchase.id}`,
      );
      this.logAuditEvent({
        ...auditBase,
        eventType: "webhook_duplicated",
        actionTaken: "duplicated",
        internalCheckoutId: purchase.id,
      });
      return;
    }

    // Atomic: re-check inside transaction to prevent double-credit on concurrent webhooks
    await this.database.$transaction(async (tx) => {
      const current = await tx.planPurchase.findUnique({
        where: { id: purchase.id },
      });
      if (!current || current.status === "completed") return;

      const analysisCredits = this.resolveAnalysisCreditsForActivation(
        purchase.planType,
        purchase.analysisCreditsGranted,
      );
      const isUnlimited = purchase.planType === "unlimited";
      const planExpiresAt = isUnlimited
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : null;

      await tx.planPurchase.update({
        where: { id: purchase.id },
        data: {
          status: "completed",
          paidAt: new Date(),
          ...(!purchase.mpPaymentId && resolution.paymentId
            ? { mpPaymentId: resolution.paymentId }
            : {}),
          ...(!purchase.mpMerchantOrderId && resolution.merchantOrderId
            ? { mpMerchantOrderId: resolution.merchantOrderId }
            : {}),
          ...(!purchase.mpPreferenceId && resolution.preferenceId
            ? { mpPreferenceId: resolution.preferenceId }
            : {}),
        },
      });

      await tx.user.update({
        where: { id: purchase.userId },
        data: {
          planType: purchase.planType,
          planActivatedAt: new Date(),
          planExpiresAt,
          creditsRemaining: isUnlimited
            ? 0
            : { increment: purchase.creditsGranted },
          analysisCreditsRemaining: isUnlimited
            ? 0
            : { increment: analysisCredits },
        },
      });
    });

    this.logger.log(
      `[webhook:plans] payment approved — purchase ${purchase.id}`,
    );
    this.logAuditEvent({
      ...auditBase,
      eventType: "payment_approved",
      actionTaken: "approved",
      internalCheckoutId: purchase.id,
    });
  }

  // Used by reconciliation: applies credit for an already-verified approved purchase
  async applyApprovedPurchase(purchaseId: string): Promise<boolean> {
    const purchase = await this.database.planPurchase.findUnique({
      where: { id: purchaseId },
    });

    if (
      !purchase ||
      purchase.status === "completed" ||
      purchase.status === "failed"
    ) {
      return false;
    }

    const analysisCredits = this.resolveAnalysisCreditsForActivation(
      purchase.planType,
      purchase.analysisCreditsGranted,
    );

    await this.activatePlan(
      purchase.userId,
      purchase.planType,
      purchase.creditsGranted,
      analysisCredits,
    );

    await this.database.planPurchase.update({
      where: { id: purchase.id },
      data: { status: "completed", paidAt: new Date() },
    });

    this.logAuditEvent({
      eventType: "reconciliation_approved",
      actionTaken: "approved",
      externalReference: purchase.paymentReference,
      internalCheckoutId: purchase.id,
      internalCheckoutType: "plan",
    });

    return true;
  }

  private async recordPaymentFailed(paymentReference: string) {
    const context: AnalysisRequestContext = {
      correlationId: `plans-webhook:${paymentReference}`,
      ip: null,
      requestId: `plans-webhook:${paymentReference}`,
      routePath: "/api/plans/webhook/mercadopago",
      sessionInternalId: null,
      sessionPublicToken: null,
      userAgentHash: null,
      userId: null,
    };

    await this.businessFunnelEventService
      .record(
        {
          eventName: "payment_failed",
          eventVersion: 1,
          idempotencyKey: `plans:${paymentReference}:payment_failed`,
          metadata: {
            paymentReference,
            provider: "mercadopago",
          },
          routeKey: "api/plans/webhook/mercadopago",
        },
        context,
        "backend",
      )
      .catch((error) => {
        this.logger.warn(
          `Failed to record payment_failed funnel event: ${error}`,
        );
      });
  }

  private async activatePlan(
    userId: string,
    planType: UserPlanType,
    downloadCreditsGranted: number,
    analysisCreditsGranted: number,
  ): Promise<void> {
    const isUnlimited = planType === "unlimited";
    const planExpiresAt = isUnlimited
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : null;

    await this.database.user.update({
      where: { id: userId },
      data: {
        planType,
        planActivatedAt: new Date(),
        planExpiresAt,
        creditsRemaining: isUnlimited
          ? 0
          : { increment: downloadCreditsGranted },
        analysisCreditsRemaining: isUnlimited
          ? 0
          : { increment: analysisCreditsGranted },
      },
    });
  }

  private resolveAnalysisCreditsForActivation(
    planType: UserPlanType,
    analysisCreditsGranted: number,
  ): number {
    if (analysisCreditsGranted > 0) {
      return analysisCreditsGranted;
    }

    if (planType === "starter" || planType === "pro" || planType === "turbo") {
      return PLAN_CONFIG[planType].analysisCreditsGranted;
    }

    return 0;
  }

  private logAuditEvent(entry: AuditEntry): void {
    this.database.paymentAuditLog
      .create({
        data: {
          provider: "mercadopago",
          eventType: entry.eventType,
          actionTaken: entry.actionTaken,
          mpPaymentId: entry.mpPaymentId ?? null,
          mpMerchantOrderId: entry.mpMerchantOrderId ?? null,
          mpPreferenceId: entry.mpPreferenceId ?? null,
          externalReference: entry.externalReference ?? null,
          internalCheckoutId: entry.internalCheckoutId ?? null,
          internalCheckoutType: entry.internalCheckoutType ?? null,
          mpStatus: entry.mpStatus ?? null,
          errorMessage: entry.errorMessage ?? null,
          ...(entry.rawPayload != null
            ? { rawPayload: entry.rawPayload as Prisma.InputJsonValue }
            : {}),
        },
      })
      .catch((err: unknown) => {
        this.logger.error(`[audit] write failed: ${err}`);
      });
  }

  private isMpProduction(): boolean {
    return (
      process.env.MERCADOPAGO_MODE === "production" ||
      process.env.NODE_ENV === "production"
    );
  }

  private getMercadoPagoClient(): MercadoPagoConfig {
    const isProduction = this.isMpProduction();
    const token = isProduction
      ? process.env.MERCADOPAGO_ACCESS_TOKEN
      : (process.env.MERCADOPAGO_ACCESS_TOKEN_TEST ??
        process.env.MERCADOPAGO_ACCESS_TOKEN);

    if (!token) {
      throw new BadRequestException("Mercado Pago token not configured.");
    }

    return new MercadoPagoConfig({ accessToken: token });
  }

  private async createMercadoPagoPreference(
    purchaseId: string,
    paymentReference: string,
    plan: { label: string; amountInCents: number },
    _adaptationId?: string,
  ): Promise<string> {
    const client = this.getMercadoPagoClient();
    const preference = new Preference(client);

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const apiUrl =
      process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:4000";
    const notificationUrl = `${apiUrl}/api/plans/webhook/mercadopago`;
    const successUrl = `${frontendUrl}/pagamento/concluido?checkoutId=${purchaseId}`;
    const isProduction = this.isMpProduction();

    try {
      const result = await preference.create({
        body: {
          items: [
            {
              id: purchaseId,
              title: plan.label,
              quantity: 1,
              unit_price: plan.amountInCents / 100,
              currency_id: "BRL",
            },
          ],
          external_reference: paymentReference,
          notification_url: notificationUrl,
          back_urls: {
            success: successUrl,
            failure: `${frontendUrl}/pagamento/falhou?checkoutId=${purchaseId}`,
            pending: `${frontendUrl}/pagamento/pendente?checkoutId=${purchaseId}`,
          },
          ...(successUrl.startsWith("https://") && { auto_return: "approved" }),
        },
      });

      const checkoutUrl = isProduction
        ? (result.init_point ?? result.sandbox_init_point)
        : (result.sandbox_init_point ?? result.init_point);

      if (!checkoutUrl) {
        throw new BadRequestException(
          "Mercado Pago did not return a checkout URL.",
        );
      }

      // Persist preference ID for traceability (non-blocking)
      if (result.id) {
        this.database.planPurchase
          .update({
            where: { id: purchaseId },
            data: { mpPreferenceId: String(result.id) },
          })
          .catch((err) => {
            this.logger.error(`Failed to save mpPreferenceId: ${err}`);
          });
      }

      return checkoutUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Mercado Pago preference error: ${message}`);
      throw new BadRequestException(`Mercado Pago error: ${message}`);
    }
  }

  private async resolveMercadoPagoPayment(
    body: unknown,
  ): Promise<MercadoPagoPaymentResolution> {
    const empty: MercadoPagoPaymentResolution = {
      paymentReference: null,
      status: "unknown",
      paymentId: null,
      merchantOrderId: null,
      preferenceId: null,
      rawStatus: null,
    };

    if (!body || typeof body !== "object") return empty;

    const data = body as Record<string, unknown>;

    if (data.type !== "payment") {
      this.logger.log(`Ignoring MP webhook type: ${String(data.type)}`);
      return empty;
    }

    const paymentIdRaw =
      typeof data.data === "object" && data.data !== null
        ? (data.data as Record<string, unknown>).id
        : null;
    const paymentId =
      typeof paymentIdRaw === "string"
        ? paymentIdRaw.trim()
        : typeof paymentIdRaw === "number"
          ? String(paymentIdRaw)
          : null;

    if (!paymentId) return empty;

    const client = this.getMercadoPagoClient();
    const paymentClient = new Payment(client);
    const payment = await paymentClient.get({ id: paymentId });

    // Cast to access fields not fully typed in SDK
    const mp = payment as unknown as {
      preference_id?: string;
      order?: { id?: number };
    };

    const paymentReference = payment.external_reference ?? null;
    const preferenceId = mp.preference_id ?? null;
    const merchantOrderId = mp.order?.id != null ? String(mp.order.id) : null;
    const rawStatus = payment.status ?? null;

    if (payment.status === "approved") {
      return {
        paymentReference,
        status: "approved",
        paymentId,
        merchantOrderId,
        preferenceId,
        rawStatus,
      };
    }

    if (
      payment.status === "cancelled" ||
      payment.status === "charged_back" ||
      payment.status === "rejected" ||
      payment.status === "refunded"
    ) {
      return {
        paymentReference,
        status: "failed",
        paymentId,
        merchantOrderId,
        preferenceId,
        rawStatus,
      };
    }

    return {
      paymentReference,
      status: "pending",
      paymentId,
      merchantOrderId,
      preferenceId,
      rawStatus,
    };
  }
}
