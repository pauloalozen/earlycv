import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { UserPlanType } from "@prisma/client";
import MercadoPagoConfig, { Payment, Preference } from "mercadopago";

import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import { DatabaseService } from "../database/database.service";

type PlanId = "starter" | "pro" | "turbo";

type MercadoPagoPaymentResolution = {
  paymentReference: string | null;
  status: "approved" | "failed" | "pending" | "unknown";
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

  async handleWebhook(provider: string, body: unknown): Promise<void> {
    if (provider !== "mercadopago") {
      throw new BadRequestException(`Provider ${provider} not supported`);
    }

    const payment = await this.resolveMercadoPagoPayment(body);
    if (!payment.paymentReference) return;

    if (payment.status === "failed") {
      const purchase = await this.database.planPurchase.findUnique({
        where: { paymentReference: payment.paymentReference },
      });

      if (
        purchase &&
        purchase.status !== "completed" &&
        purchase.status !== "failed"
      ) {
        await this.database.planPurchase.update({
          where: { id: purchase.id },
          data: { status: "failed" },
        });
      }

      await this.recordPaymentFailed(payment.paymentReference);
      return;
    }

    if (payment.status !== "approved") {
      return;
    }

    const purchase = await this.database.planPurchase.findUnique({
      where: { paymentReference: payment.paymentReference },
    });

    if (!purchase || purchase.status === "completed") return;

    await this.database.planPurchase.update({
      where: { id: purchase.id },
      data: { status: "completed", paidAt: new Date() },
    });

    await this.activatePlan(
      purchase.userId,
      purchase.planType,
      purchase.creditsGranted,
      this.resolveAnalysisCreditsForActivation(
        purchase.planType,
        purchase.analysisCreditsGranted,
      ),
    );
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
  ): Promise<string> {
    const client = this.getMercadoPagoClient();
    const preference = new Preference(client);

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const apiUrl =
      process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:4000";
    const notificationUrl = `${apiUrl}/api/plans/webhook/mercadopago`;
    const successUrl = `${frontendUrl}/dashboard?plan=activated`;
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
            failure: `${frontendUrl}/planos?error=payment_failed`,
            pending: `${frontendUrl}/dashboard`,
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
    if (!body || typeof body !== "object") {
      return {
        paymentReference: null,
        status: "unknown",
      };
    }

    const data = body as Record<string, unknown>;

    if (data.type !== "payment") {
      this.logger.log(`Ignoring MP webhook type: ${String(data.type)}`);
      return {
        paymentReference: null,
        status: "unknown",
      };
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

    if (!paymentId) {
      return {
        paymentReference: null,
        status: "unknown",
      };
    }

    const client = this.getMercadoPagoClient();
    const paymentClient = new Payment(client);
    const payment = await paymentClient.get({ id: paymentId });

    const paymentReference = payment.external_reference ?? null;
    if (payment.status === "approved") {
      return {
        paymentReference,
        status: "approved",
      };
    }

    if (
      payment.status === "cancelled" ||
      payment.status === "charged_back" ||
      payment.status === "rejected" ||
      payment.status === "refunded"
    ) {
      this.logger.log(
        `Payment ${paymentId} failed with status: ${payment.status}`,
      );
      return {
        paymentReference,
        status: "failed",
      };
    }

    this.logger.log(`Payment ${paymentId} not approved: ${payment.status}`);
    return {
      paymentReference,
      status: "pending",
    };
  }
}
