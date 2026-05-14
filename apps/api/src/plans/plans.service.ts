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
import {
  buildMercadoPagoItemMetadata,
  buildMercadoPagoReturnConfig,
} from "../payments/mercado-pago-return-config";
import { sanitizePaymentAuditPayload } from "../payments/payment-audit-sanitization";

type PlanId = "starter" | "pro" | "turbo";

type MercadoPagoPaymentResolution = {
  purchaseId: string | null;
  externalReference: string | null;
  paymentReference: string | null;
  status: "approved" | "failed" | "pending" | "unknown";
  paymentId: string | null;
  merchantOrderId: string | null;
  preferenceId: string | null;
  rawStatus: string | null;
  statusDetail: string | null;
};

type PaymentFailureEnrichmentInput = {
  paymentReference: string;
  paymentId: string | null;
  merchantOrderId: string | null;
  preferenceId: string | null;
  rawStatus: string | null;
  statusDetail: string | null;
};

type WebhookPurchaseRecord = {
  id: string;
  userId: string;
  planType: string;
  amountInCents: number;
  currency: string;
  paymentProvider: string;
  status: string;
  creditsGranted: number;
  analysisCreditsGranted: number;
  paymentReference: string;
  mpPaymentId: string | null;
  mpMerchantOrderId: string | null;
  mpPreferenceId: string | null;
  originAction: PurchaseOriginAction;
  originAdaptationId: string | null;
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

const APPROVED_PURCHASE_ELIGIBLE_STATUSES = new Set([
  "none",
  "pending",
  "processing_payment",
  "pending_payment",
]);

type MercadoPagoPayerInput = {
  email: string;
  name?: string;
};

type PurchaseOriginAction = "buy_credits" | "unlock_cv";

type PlanConfigEntry = {
  label: string;
  amountInCents: number;
  downloadCreditsGranted: number;
  analysisCreditsGranted: number;
};

function getPlanConfig(): Record<PlanId, PlanConfigEntry> {
  return {
    starter: {
      label: `${requireEnvInt("QNT_CV_PLAN_STARTER")} CV Otimizado — EarlyCV`,
      amountInCents: requireEnvInt("PRICE_PLAN_STARTER"),
      downloadCreditsGranted: requireEnvInt("QNT_CV_PLAN_STARTER"),
      analysisCreditsGranted: 0,
    },
    pro: {
      label: `${requireEnvInt("QNT_CV_PLAN_PRO")} CVs Otimizados — EarlyCV`,
      amountInCents: requireEnvInt("PRICE_PLAN_PRO"),
      downloadCreditsGranted: requireEnvInt("QNT_CV_PLAN_PRO"),
      analysisCreditsGranted: 0,
    },
    turbo: {
      label: `${requireEnvInt("QNT_CV_PLAN_TURBO")} CVs Otimizados — EarlyCV`,
      amountInCents: requireEnvInt("PRICE_PLAN_TURBO"),
      downloadCreditsGranted: requireEnvInt("QNT_CV_PLAN_TURBO"),
      analysisCreditsGranted: 0,
    },
  };
}

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(BusinessFunnelEventService)
    private readonly businessFunnelEventService: BusinessFunnelEventService,
  ) {}

  async listMyPurchases(userId: string): Promise<
    {
      id: string;
      planType: string;
      planName: string | null;
      amountInCents: number;
      currency: string;
      status: string;
      paidAt: string | null;
      creditsGranted: number;
      analysisCreditsGranted: number;
      mpPaymentId: string | null;
      mpPreferenceId: string | null;
      paymentReference: string;
      createdAt: string;
      pendingPaymentUrl: string | null;
      originAction: PurchaseOriginAction;
      originAdaptationId: string | null;
      autoUnlockProcessedAt: string | null;
      autoUnlockError: string | null;
    }[]
  > {
    const purchases = await this.database.planPurchase.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        planType: true,
        amountInCents: true,
        currency: true,
        status: true,
        paidAt: true,
        creditsGranted: true,
        analysisCreditsGranted: true,
        mpPaymentId: true,
        mpPreferenceId: true,
        paymentReference: true,
        createdAt: true,
        originAction: true,
        originAdaptationId: true,
        autoUnlockProcessedAt: true,
        autoUnlockError: true,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

    return purchases.map((p) => ({
      id: p.id,
      planType: p.planType,
      planName: planTypeToDisplayName(p.planType),
      amountInCents: p.amountInCents,
      currency: p.currency,
      status: p.status,
      paidAt: p.paidAt?.toISOString() ?? null,
      creditsGranted: p.creditsGranted,
      analysisCreditsGranted: p.analysisCreditsGranted,
      mpPaymentId: p.mpPaymentId ?? null,
      mpPreferenceId: p.mpPreferenceId ?? null,
      paymentReference: p.paymentReference,
      createdAt: p.createdAt.toISOString(),
      originAction: p.originAction,
      originAdaptationId: p.originAdaptationId,
      autoUnlockProcessedAt: p.autoUnlockProcessedAt?.toISOString() ?? null,
      autoUnlockError: p.autoUnlockError,
      pendingPaymentUrl:
        p.status === "pending" || p.status === "none"
          ? `${frontendUrl}/pagamento/pendente?checkoutId=${p.id}&resume=1`
          : null,
    }));
  }

  async createCheckout(
    userId: string,
    planId: PlanId,
    adaptationId?: string,
  ): Promise<{
    checkoutUrl: string;
    purchaseId: string;
    checkoutMode?: "brick";
  }> {
    const plan = getPlanConfig()[planId];
    const payer = await this.resolveMercadoPagoPayer(userId);

    if (adaptationId) {
      await this.assertAdaptationCanBeAutoUnlocked(userId, adaptationId);
    }

    const existing = await this.database.planPurchase.findFirst({
      where: {
        userId,
        planType: planId as UserPlanType,
        status: { in: ["none", "pending"] },
        originAction: adaptationId ? "unlock_cv" : "buy_credits",
        originAdaptationId: adaptationId ?? null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      this.logger.log(
        `[checkout] reusing existing purchase ${existing.id} for user ${userId}`,
      );

      const brickDecision = this.evaluateBrickCheckoutEligibility();
      this.logger.log(
        `[checkout] mode_decision purchase=${existing.id} user=${userId} useBrick=${String(brickDecision.useBrick)} reason=${brickDecision.reason}`,
      );

      const existingUpdate = await this.database.planPurchase.updateMany({
        where: { id: existing.id, userId },
        data: {
          amountInCents: plan.amountInCents,
          creditsGranted: plan.downloadCreditsGranted,
          analysisCreditsGranted: plan.analysisCreditsGranted,
          ...(brickDecision.useBrick ? { status: "pending" } : {}),
        },
      });

      if (existingUpdate.count !== 1) {
        throw new NotFoundException("Compra nao encontrada.");
      }

      if (brickDecision.useBrick) {
        return {
          checkoutUrl: this.buildBrickCheckoutUrl(existing.id),
          purchaseId: existing.id,
          checkoutMode: "brick",
        };
      }

      const checkoutUrl = await this.createMercadoPagoPreference(
        existing.id,
        existing.paymentReference,
        plan,
        payer,
        adaptationId,
      );
      return { checkoutUrl, purchaseId: existing.id };
    }

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
        originAction: adaptationId ? "unlock_cv" : "buy_credits",
        originAdaptationId: adaptationId ?? null,
      },
    });

    const brickDecision = this.evaluateBrickCheckoutEligibility();
    this.logger.log(
      `[checkout] mode_decision purchase=${purchase.id} user=${userId} useBrick=${String(brickDecision.useBrick)} reason=${brickDecision.reason}`,
    );

    if (brickDecision.useBrick) {
      await this.database.planPurchase.update({
        where: { id: purchase.id },
        data: { status: "pending" },
      });
      return {
        checkoutUrl: this.buildBrickCheckoutUrl(purchase.id),
        purchaseId: purchase.id,
        checkoutMode: "brick",
      };
    }

    const checkoutUrl = await this.createMercadoPagoPreference(
      purchase.id,
      paymentReference,
      plan,
      payer,
      adaptationId,
    );

    return { checkoutUrl, purchaseId: purchase.id };
  }

  async resumeCheckout(
    userId: string,
    purchaseId: string,
  ): Promise<{ checkoutUrl: string }> {
    const payer = await this.resolveMercadoPagoPayer(userId);
    const purchase = await this.database.planPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        id: true,
        userId: true,
        planType: true,
        amountInCents: true,
        creditsGranted: true,
        analysisCreditsGranted: true,
        paymentReference: true,
        status: true,
      },
    });

    if (!purchase || purchase.userId !== userId) {
      throw new NotFoundException("Compra nao encontrada.");
    }

    if (purchase.status !== "pending" && purchase.status !== "none") {
      throw new BadRequestException("Compra nao pode ser retomada.");
    }

    if (!isPaidPlanType(purchase.planType)) {
      throw new BadRequestException("Tipo de compra invalido para retomada.");
    }

    const checkoutUrl = await this.createMercadoPagoPreference(
      purchase.id,
      purchase.paymentReference,
      {
        label: `${purchase.creditsGranted} CV${purchase.creditsGranted === 1 ? "" : "s"} Otimizado${purchase.creditsGranted === 1 ? "" : "s"} — EarlyCV`,
        amountInCents: purchase.amountInCents,
        downloadCreditsGranted: purchase.creditsGranted,
        analysisCreditsGranted: purchase.analysisCreditsGranted,
      },
      payer,
    );

    this.logger.log(
      `[checkout:resume] purchase=${purchase.id} user=${userId} status=${purchase.status}`,
    );

    return { checkoutUrl };
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

    const secrets = this.getMercadoPagoWebhookSecrets();
    if (secrets.length === 0) return; // dev: sem secret configurado, aceita sem validar

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
    const receivedBuf = Buffer.from(v1);

    const matches = secrets.some((secret) => {
      const expected = createHmac("sha256", secret)
        .update(message)
        .digest("hex");
      const expectedBuf = Buffer.from(expected);
      return (
        expectedBuf.length === receivedBuf.length &&
        timingSafeEqual(expectedBuf, receivedBuf)
      );
    });

    if (!matches) {
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

    if (
      !resolution.purchaseId &&
      !resolution.externalReference &&
      !resolution.paymentReference &&
      !resolution.paymentId
    ) {
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
      externalReference:
        resolution.externalReference ?? resolution.paymentReference,
      internalCheckoutType: "plan",
      mpStatus: resolution.rawStatus,
      rawPayload: body as object,
    };

    const purchase = await this.findPurchaseForWebhook(resolution);

    if (resolution.status === "failed") {
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

      const failureReference =
        resolution.paymentReference ?? purchase?.paymentReference ?? null;
      if (failureReference) {
        await this.recordPaymentFailed(
          {
            paymentId: resolution.paymentId,
            paymentReference: failureReference,
            preferenceId: resolution.preferenceId,
            merchantOrderId: resolution.merchantOrderId,
            rawStatus: resolution.rawStatus,
            statusDetail: resolution.statusDetail,
          },
          purchase,
        );
      }
      this.logAuditEvent({
        ...auditBase,
        eventType: "payment_rejected",
        actionTaken: "failed",
        internalCheckoutId: purchase?.id ?? null,
        errorMessage: resolution.statusDetail ?? resolution.rawStatus,
      });
      return;
    }

    if (resolution.status !== "approved") {
      this.logger.log(
        `[webhook:plans] ignored — status is ${resolution.rawStatus}`,
      );
      this.logAuditEvent({
        ...auditBase,
        eventType: "payment_pending",
        actionTaken: "pending",
        internalCheckoutId: purchase?.id ?? null,
      });
      return;
    }

    if (!purchase) {
      this.logger.warn(
        `[webhook:plans] unknown payment reference purchaseId=${resolution.purchaseId ?? "-"} external=${resolution.externalReference ?? "-"} paymentReference=${resolution.paymentReference ?? "-"}`,
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
      if (!current) return;

      if (!isEligibleStatusForApprovedPurchase(current.status)) {
        this.logAuditEvent({
          ...auditBase,
          eventType: "webhook_transition_ignored",
          actionTaken: "ignored",
          internalCheckoutId: purchase.id,
          errorMessage: `invalid_transition:${current.status}->approved`,
        });
        return;
      }

      await this.applyApprovedPurchaseInsideTransaction(tx, current, {
        mpMerchantOrderId: resolution.merchantOrderId,
        mpPaymentId: resolution.paymentId,
        mpPreferenceId: resolution.preferenceId,
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
    const appliedPurchase = await this.database.$transaction(async (tx) => {
      const purchase = await tx.planPurchase.findUnique({
        where: { id: purchaseId },
      });

      if (!purchase) {
        return null;
      }

      if (!isEligibleStatusForApprovedPurchase(purchase.status)) {
        return null;
      }

      await this.applyApprovedPurchaseInsideTransaction(tx, purchase);

      return purchase;
    });

    if (!appliedPurchase) {
      return false;
    }

    this.logAuditEvent({
      eventType: "reconciliation_approved",
      actionTaken: "approved",
      externalReference: appliedPurchase.paymentReference,
      internalCheckoutId: appliedPurchase.id,
      internalCheckoutType: "plan",
    });

    return true;
  }

  private async recordPaymentFailed(
    resolution: PaymentFailureEnrichmentInput,
    purchase?: {
      id: string;
      userId: string;
      planType: string;
      amountInCents: number;
      currency: string;
      paymentProvider: string;
      status: string;
      creditsGranted: number;
      mpPaymentId: string | null;
      mpMerchantOrderId: string | null;
      mpPreferenceId: string | null;
      originAction: PurchaseOriginAction;
      originAdaptationId: string | null;
    } | null,
  ) {
    const resolvedPurchase =
      purchase ?? (await this.findPurchaseForFailedPayment(resolution));
    const purchaseResolved = Boolean(resolvedPurchase);
    const enrichmentStatus = purchaseResolved
      ? "enriched_from_purchase"
      : "purchase_not_found";

    this.logger.log(
      `[webhook:plans] payment_failed enrichment paymentReference=${resolution.paymentReference} purchaseResolved=${purchaseResolved} purchaseId=${resolvedPurchase?.id ?? "null"} userId=${resolvedPurchase?.userId ?? "null"} enrichmentStatus=${enrichmentStatus}`,
    );

    const distinctId =
      resolvedPurchase?.userId ??
      resolution.paymentReference ??
      resolvedPurchase?.id ??
      null;

    const metadata: Record<string, unknown> = {
      purchaseResolved,
      enrichmentStatus,
      paymentReference: resolution.paymentReference,
      paymentId: resolution.paymentId,
      merchantOrderId: resolution.merchantOrderId,
      preferenceId: resolution.preferenceId,
      provider: "mercadopago",
      paymentStatus: "failed",
      statusDetail: resolution.rawStatus,
      failureReason: resolution.statusDetail ?? resolution.rawStatus,
      ...(!resolvedPurchase && resolution.rawStatus
        ? { failureCode: resolution.statusDetail ?? resolution.rawStatus }
        : {}),
      ...(distinctId ? { distinct_id: distinctId } : {}),
    };

    if (resolvedPurchase) {
      metadata.userId = resolvedPurchase.userId;
      metadata.user_id = resolvedPurchase.userId;
      metadata.purchaseId = resolvedPurchase.id;
      metadata.planId = resolvedPurchase.planType;
      metadata.planName = planTypeToDisplayName(resolvedPurchase.planType);
      metadata.amount = resolvedPurchase.amountInCents;
      metadata.credits = resolvedPurchase.creditsGranted;
      metadata.currency = resolvedPurchase.currency;
      metadata.originAction = resolvedPurchase.originAction;
      metadata.originAdaptationId = resolvedPurchase.originAdaptationId;
      metadata.paymentMethod = "pix";
    }

    const context: AnalysisRequestContext = {
      correlationId: `plans-webhook:${resolution.paymentReference}`,
      ip: null,
      requestId: `plans-webhook:${resolution.paymentReference}`,
      routePath: "/api/plans/webhook/mercadopago",
      sessionInternalId: null,
      sessionPublicToken: null,
      userAgentHash: null,
      userId: resolvedPurchase?.userId ?? null,
    };

    await this.businessFunnelEventService
      .record(
        {
          eventName: "payment_failed",
          eventVersion: 1,
          idempotencyKey: `plans:${resolution.paymentReference}:payment_failed`,
          metadata,
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

  private async findPurchaseForFailedPayment(
    resolution: PaymentFailureEnrichmentInput,
  ) {
    const whereCandidates: Array<Record<string, string>> = [];

    if (resolution.paymentReference) {
      whereCandidates.push({ paymentReference: resolution.paymentReference });
    }
    if (resolution.paymentId) {
      whereCandidates.push({ mpPaymentId: resolution.paymentId });
    }
    if (resolution.merchantOrderId) {
      whereCandidates.push({ mpMerchantOrderId: resolution.merchantOrderId });
    }
    if (resolution.preferenceId) {
      whereCandidates.push({ mpPreferenceId: resolution.preferenceId });
    }

    for (const where of whereCandidates) {
      const purchase = await this.database.planPurchase.findFirst({ where });
      if (purchase) {
        return purchase;
      }
    }

    return null;
  }

  private async applyApprovedPurchaseInsideTransaction(
    tx: Prisma.TransactionClient,
    purchase: {
      id: string;
      userId: string;
      planType: UserPlanType;
      paymentReference: string;
      status: string;
      creditsGranted: number;
      analysisCreditsGranted: number;
      originAction: PurchaseOriginAction;
      originAdaptationId: string | null;
      mpPaymentId: string | null;
      mpMerchantOrderId: string | null;
      mpPreferenceId: string | null;
    },
    updates?: {
      mpPaymentId?: string | null;
      mpMerchantOrderId?: string | null;
      mpPreferenceId?: string | null;
    },
  ): Promise<void> {
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
        ...(!purchase.mpPaymentId && updates?.mpPaymentId
          ? { mpPaymentId: updates.mpPaymentId }
          : {}),
        ...(!purchase.mpMerchantOrderId && updates?.mpMerchantOrderId
          ? { mpMerchantOrderId: updates.mpMerchantOrderId }
          : {}),
        ...(!purchase.mpPreferenceId && updates?.mpPreferenceId
          ? { mpPreferenceId: updates.mpPreferenceId }
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

    if (
      purchase.originAction !== "unlock_cv" ||
      !purchase.originAdaptationId ||
      isUnlimited
    ) {
      return;
    }

    if (purchase.creditsGranted <= 0) {
      await tx.planPurchase.update({
        where: { id: purchase.id },
        data: {
          autoUnlockError: "purchase has no credits to auto-unlock",
        },
      });
      return;
    }

    const adaptation = await tx.cvAdaptation.findUnique({
      where: { id: purchase.originAdaptationId },
      select: {
        id: true,
        userId: true,
        isUnlocked: true,
        adaptedContentJson: true,
      },
    });

    if (!adaptation) {
      await tx.planPurchase.update({
        where: { id: purchase.id },
        data: {
          autoUnlockError: "origin adaptation not found",
        },
      });
      return;
    }

    if (adaptation.userId !== purchase.userId) {
      await tx.planPurchase.update({
        where: { id: purchase.id },
        data: {
          autoUnlockError: "origin adaptation ownership mismatch",
        },
      });
      return;
    }

    if (adaptation.isUnlocked) {
      await tx.planPurchase.update({
        where: { id: purchase.id },
        data: {
          autoUnlockProcessedAt: new Date(),
          autoUnlockError: null,
        },
      });
      return;
    }

    if (!adaptation.adaptedContentJson) {
      await tx.planPurchase.update({
        where: { id: purchase.id },
        data: {
          autoUnlockError: "origin adaptation has no adapted content",
        },
      });
      return;
    }

    await tx.user.update({
      where: { id: purchase.userId },
      data: { creditsRemaining: { decrement: 1 } },
    });

    await tx.cvAdaptation.update({
      where: { id: adaptation.id },
      data: {
        status: "paid",
        isUnlocked: true,
        unlockedAt: new Date(),
      },
    });

    await tx.cvUnlock.upsert({
      where: { cvAdaptationId: adaptation.id },
      create: {
        userId: purchase.userId,
        cvAdaptationId: adaptation.id,
        creditsConsumed: 1,
        source: "CREDIT",
        status: "UNLOCKED",
        unlockedAt: new Date(),
      },
      update: {
        status: "UNLOCKED",
        creditsConsumed: 1,
        source: "CREDIT",
        unlockedAt: new Date(),
      },
    });

    await tx.planPurchase.update({
      where: { id: purchase.id },
      data: {
        autoUnlockProcessedAt: new Date(),
        autoUnlockError: null,
      },
    });
  }

  private async assertAdaptationCanBeAutoUnlocked(
    userId: string,
    adaptationId: string,
  ): Promise<void> {
    const adaptation = await this.database.cvAdaptation.findUnique({
      where: { id: adaptationId },
      select: {
        userId: true,
        isUnlocked: true,
        adaptedContentJson: true,
      },
    });

    if (!adaptation || adaptation.userId !== userId) {
      throw new NotFoundException("adaptation not found");
    }

    if (adaptation.isUnlocked) {
      throw new BadRequestException("CV ja esta liberado.");
    }

    if (!adaptation.adaptedContentJson) {
      throw new BadRequestException("Adaptation analysis is not ready yet.");
    }
  }

  private resolveAnalysisCreditsForActivation(
    planType: UserPlanType,
    analysisCreditsGranted: number,
  ): number {
    if (analysisCreditsGranted > 0) {
      return analysisCreditsGranted;
    }

    if (planType === "starter" || planType === "pro" || planType === "turbo") {
      return getPlanConfig()[planType].analysisCreditsGranted;
    }

    return 0;
  }

  private async resolveMercadoPagoPayer(
    userId: string,
  ): Promise<MercadoPagoPayerInput | undefined> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
      },
    });

    if (!user || !isValidEmail(user.email)) {
      return undefined;
    }

    const name = user.name.trim();
    return {
      email: user.email,
      ...(name ? { name } : {}),
    };
  }

  private logAuditEvent(entry: AuditEntry): void {
    const sanitizedPayload = sanitizePaymentAuditPayload(entry.rawPayload);

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
          ...(sanitizedPayload != null
            ? { rawPayload: sanitizedPayload as Prisma.InputJsonValue }
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
    const token = this.getProAccessToken();

    if (!token) {
      throw new BadRequestException("Mercado Pago token not configured.");
    }

    return new MercadoPagoConfig({ accessToken: token });
  }

  private getProAccessToken(): string | null {
    const explicit = process.env.MERCADOPAGO_PRO_ACCESS_TOKEN?.trim();
    if (explicit) {
      return explicit;
    }

    const isProduction = this.isMpProduction();
    if (isProduction) {
      return process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ?? null;
    }

    return (
      process.env.MERCADOPAGO_PRO_ACCESS_TOKEN_TEST?.trim() ??
      process.env.MERCADOPAGO_ACCESS_TOKEN_TEST?.trim() ??
      process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ??
      null
    );
  }

  private getMercadoPagoWebhookSecrets(): string[] {
    const candidates = [
      process.env.MERCADOPAGO_PRO_WEBHOOK_SECRET,
      process.env.MERCADOPAGO_BRICK_WEBHOOK_SECRET,
      process.env.MERCADOPAGO_WEBHOOK_SECRET,
    ];

    return Array.from(
      new Set(
        candidates
          .map((value) => value?.trim() ?? "")
          .filter((value) => value.length > 0),
      ),
    );
  }

  private async createMercadoPagoPreference(
    purchaseId: string,
    paymentReference: string,
    plan: {
      label: string;
      amountInCents: number;
      downloadCreditsGranted?: number;
      analysisCreditsGranted?: number;
    },
    payer?: MercadoPagoPayerInput,
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
    const returnConfig = buildMercadoPagoReturnConfig({
      frontendUrl,
      successPath: `/pagamento/concluido?checkoutId=${purchaseId}`,
      failurePath: `/pagamento/falhou?checkoutId=${purchaseId}`,
      pendingPath: `/pagamento/pendente?checkoutId=${purchaseId}`,
    });
    if (!returnConfig.successUrlIsHttps) {
      this.logger.warn(
        `[mp:return-config] flow=plan_purchase purchaseId=${purchaseId} frontendHost=${returnConfig.frontendHost} successUrlIsHttps=${String(returnConfig.successUrlIsHttps)} autoReturnEnabled=${String(returnConfig.autoReturnEnabled)}`,
      );
    }
    const isProduction = this.isMpProduction();
    const itemMetadata = buildMercadoPagoItemMetadata({
      flow: "plan_purchase",
      planLabel: plan.label,
    });

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
              ...itemMetadata,
            },
          ],
          external_reference: paymentReference,
          ...(payer ? { payer } : {}),
          notification_url: notificationUrl,
          back_urls: returnConfig.backUrls,
          payment_methods: {
            excluded_payment_types: [{ id: "ticket" }],
          },
          ...(returnConfig.autoReturn
            ? { auto_return: returnConfig.autoReturn }
            : {}),
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
      purchaseId: null,
      externalReference: null,
      paymentReference: null,
      status: "unknown",
      paymentId: null,
      merchantOrderId: null,
      preferenceId: null,
      rawStatus: null,
      statusDetail: null,
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

    const externalReference = payment.external_reference ?? null;
    const paymentMetadata = (payment as unknown as { metadata?: unknown })
      .metadata;
    const metadataPurchaseId =
      typeof paymentMetadata === "object" && paymentMetadata !== null
        ? normalizeString(
            (paymentMetadata as Record<string, unknown>).purchaseId,
          )
        : null;
    const paymentReference = externalReference;
    const preferenceId = mp.preference_id ?? null;
    const merchantOrderId = mp.order?.id != null ? String(mp.order.id) : null;
    const rawStatus = payment.status ?? null;
    const statusDetail = payment.status_detail ?? null;

    if (payment.status === "approved") {
      return {
        paymentReference,
        purchaseId: metadataPurchaseId,
        externalReference,
        status: "approved",
        paymentId,
        merchantOrderId,
        preferenceId,
        rawStatus,
        statusDetail,
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
        purchaseId: metadataPurchaseId,
        externalReference,
        status: "failed",
        paymentId,
        merchantOrderId,
        preferenceId,
        rawStatus,
        statusDetail,
      };
    }

    return {
      paymentReference,
      purchaseId: metadataPurchaseId,
      externalReference,
      status: "pending",
      paymentId,
      merchantOrderId,
      preferenceId,
      rawStatus,
      statusDetail,
    };
  }

  private buildBrickCheckoutUrl(purchaseId: string): string {
    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    return new URL(`/pagamento/checkout/${purchaseId}`, frontendUrl).toString();
  }

  private evaluateBrickCheckoutEligibility(): {
    useBrick: boolean;
    reason: string;
  } {
    const mode = (process.env.PAYMENT_CHECKOUT_MODE ?? "pro")
      .trim()
      .toLowerCase();
    if (mode !== "brick") {
      return { useBrick: false, reason: "mode_not_brick" };
    }
    return { useBrick: true, reason: "mode_brick" };
  }

  private async findPurchaseForWebhook(
    resolution: MercadoPagoPaymentResolution,
  ): Promise<WebhookPurchaseRecord | null> {
    const whereCandidates: Array<Record<string, string>> = [];

    if (resolution.purchaseId) {
      whereCandidates.push({ id: resolution.purchaseId });
    }
    if (resolution.externalReference) {
      whereCandidates.push({ id: resolution.externalReference });
      whereCandidates.push({ paymentReference: resolution.externalReference });
    }
    if (resolution.paymentId) {
      whereCandidates.push({ mpPaymentId: resolution.paymentId });
    }
    if (resolution.paymentReference) {
      whereCandidates.push({ paymentReference: resolution.paymentReference });
    }

    const planPurchaseStore = this.database.planPurchase as unknown as {
      findFirst?: (query: {
        where: Record<string, string>;
      }) => Promise<WebhookPurchaseRecord | null>;
      findUnique?: (query: {
        where: Record<string, string>;
      }) => Promise<WebhookPurchaseRecord | null>;
    };

    for (const where of whereCandidates) {
      let purchase = planPurchaseStore.findFirst
        ? await planPurchaseStore.findFirst({ where })
        : null;
      if (!purchase && planPurchaseStore.findUnique) {
        purchase = await planPurchaseStore.findUnique({ where });
      }
      if (purchase) {
        return purchase;
      }
    }

    return null;
  }
}

function isEligibleStatusForApprovedPurchase(status: string): boolean {
  return APPROVED_PURCHASE_ELIGIBLE_STATUSES.has(status);
}

function planTypeToDisplayName(planType: string): string | null {
  const names: Record<string, string> = {
    starter: "Starter",
    pro: "Pro",
    turbo: "Turbo",
    unlimited: "Ilimitado",
  };
  return names[planType] ?? null;
}

function isPaidPlanType(planType: string): planType is PlanId {
  return planType === "starter" || planType === "pro" || planType === "turbo";
}

function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function requireEnvInt(...names: string[]): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw) {
      const value = parseInt(raw, 10);
      if (isNaN(value)) {
        throw new Error(
          `Env var ${name} must be a valid integer, got: "${raw}"`,
        );
      }
      return value;
    }
  }
  throw new Error(`Required env var(s) [${names.join(", ")}] are not set`);
}
