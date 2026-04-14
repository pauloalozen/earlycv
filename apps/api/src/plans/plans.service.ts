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

import { DatabaseService } from "../database/database.service";
import {
  buildSaoPauloUsageDate,
  resolveDailyAnalysisLimit,
} from "./analysis-limit";

type PlanId = "starter" | "pro" | "turbo";

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
        analysisCreditsRemaining: true,
        planExpiresAt: true,
      },
    });

    if (!user) throw new NotFoundException("user not found");

    if (user.internalRole === "superadmin") {
      return {
        planType: "unlimited",
        creditsRemaining: null,
        analysisCreditsRemaining: null,
        dailyAnalysisLimit: null,
        dailyAnalysisUsed: 0,
        dailyAnalysisRemaining: null,
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

    const dailyAnalysisLimit = resolveDailyAnalysisLimit(effectivePlanType);
    const usageDate = buildSaoPauloUsageDate(new Date());
    const dailyUsage = await this.database.userDailyAnalysisUsage.findUnique({
      where: {
        userId_usageDate: {
          userId,
          usageDate,
        },
      },
      select: { usedCount: true },
    });
    const dailyAnalysisUsed = dailyUsage?.usedCount ?? 0;

    return {
      planType: effectivePlanType,
      creditsRemaining:
        isUnlimited && !isExpired ? null : user.creditsRemaining,
      analysisCreditsRemaining:
        isUnlimited && !isExpired ? null : user.analysisCreditsRemaining,
      dailyAnalysisLimit,
      dailyAnalysisUsed,
      dailyAnalysisRemaining:
        dailyAnalysisLimit === null
          ? null
          : Math.max(dailyAnalysisLimit - dailyAnalysisUsed, 0),
      planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
      isActive: user.planType !== "free" && !isExpired,
    };
  }

  async handleWebhook(provider: string, body: unknown): Promise<void> {
    if (provider !== "mercadopago") {
      throw new BadRequestException(`Provider ${provider} not supported`);
    }

    const paymentReference = await this.resolveMercadoPagoPayment(body);
    if (!paymentReference) return;

    const purchase = await this.database.planPurchase.findUnique({
      where: { paymentReference },
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
  ): Promise<string | null> {
    if (!body || typeof body !== "object") return null;

    const data = body as Record<string, unknown>;

    if (data.type !== "payment") {
      this.logger.log(`Ignoring MP webhook type: ${String(data.type)}`);
      return null;
    }

    const paymentId =
      typeof data.data === "object" && data.data !== null
        ? String((data.data as Record<string, unknown>).id)
        : null;

    if (!paymentId) return null;

    const client = this.getMercadoPagoClient();
    const paymentClient = new Payment(client);
    const payment = await paymentClient.get({ id: paymentId });

    if (payment.status !== "approved") {
      this.logger.log(`Payment ${paymentId} not approved: ${payment.status}`);
      return null;
    }

    return payment.external_reference ?? null;
  }
}
