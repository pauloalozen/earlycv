import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import MercadoPagoConfig, { Payment } from "mercadopago";
import { DatabaseService } from "../database/database.service";
import { PlansService } from "../plans/plans.service";

type CheckoutStatus = "pending" | "approved" | "failed";
type NextAction =
  | "show_success"
  | "keep_waiting"
  | "show_failure"
  | "retry_payment";

export type PaymentListRecord = {
  checkoutId: string;
  type: "plan";
  userId: string;
  userEmail: string | null;
  planName: string | null;
  status: string;
  mpPaymentId: string | null;
  mpPreferenceId: string | null;
  externalReference: string | null;
  amountInCents: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentAuditEntry = {
  id: string;
  eventType: string;
  actionTaken: string;
  mpPaymentId: string | null;
  mpMerchantOrderId: string | null;
  mpStatus: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type PaymentDetailRecord = {
  checkout: PaymentListRecord;
  auditLogs: PaymentAuditEntry[];
};

export type CheckoutStatusResponse = {
  checkoutId: string;
  status: CheckoutStatus;
  nextAction: NextAction;
  type: "plan";
  planPurchased: string | null;
  planName: string | null;
  creditsGranted: number | null;
  analysisCreditsGranted: number | null;
  adaptationId: string | null;
  originAction: "buy_credits" | "unlock_cv";
  originAdaptationId: string | null;
  autoUnlockProcessedAt: string | null;
  autoUnlockError: string | null;
  adaptationUnlocked: boolean;
  paymentId: string | null;
  message: string;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PlansService) private readonly plansService: PlansService,
  ) {}

  async getCheckoutStatus(
    userId: string,
    checkoutId: string,
  ): Promise<CheckoutStatusResponse> {
    const purchase = await this.database.planPurchase.findFirst({
      where: { id: checkoutId, userId },
    });

    if (purchase) {
      const adaptation = purchase.originAdaptationId
        ? await this.database.cvAdaptation.findFirst({
            where: {
              id: purchase.originAdaptationId,
              userId,
            },
            select: { isUnlocked: true },
          })
        : null;
      const status = mapPaymentStatus(purchase.status);
      const nextAction = mapNextAction(status);
      return {
        checkoutId,
        status,
        nextAction,
        type: "plan",
        planPurchased: purchase.planType,
        planName: planTypeToName(purchase.planType),
        creditsGranted: purchase.creditsGranted,
        analysisCreditsGranted: purchase.analysisCreditsGranted,
        adaptationId: purchase.originAdaptationId,
        originAction: purchase.originAction,
        originAdaptationId: purchase.originAdaptationId,
        autoUnlockProcessedAt:
          purchase.autoUnlockProcessedAt?.toISOString() ?? null,
        autoUnlockError: purchase.autoUnlockError,
        adaptationUnlocked: adaptation?.isUnlocked ?? false,
        paymentId: purchase.mpPaymentId ?? null,
        message: buildMessage(status, "plan"),
      };
    }

    throw new NotFoundException("Checkout não encontrado.");
  }

  async reconcilePending(limit = 50): Promise<{
    reconciledPlans: number;
    reconciledAdaptations: number;
    total: number;
  }> {
    const pendingPurchases = await this.database.planPurchase.findMany({
      where: { status: "pending" },
      take: limit,
      orderBy: { createdAt: "asc" },
    });

    const client = this.getMercadoPagoClient();
    if (!client) {
      this.logger.warn("[reconcile] MP client unavailable — skipping");
      return { reconciledPlans: 0, reconciledAdaptations: 0, total: 0 };
    }

    const paymentClient = new Payment(client);
    let reconciledPlans = 0;
    const reconciledAdaptations = 0;

    for (const purchase of pendingPurchases) {
      try {
        const results = await paymentClient.search({
          options: { external_reference: purchase.paymentReference },
        });
        const approved = results.results?.find((p) => p.status === "approved");
        if (approved) {
          const applied = await this.plansService.applyApprovedPurchase(
            purchase.id,
          );
          if (applied) reconciledPlans++;
        }
      } catch (err) {
        this.logger.warn(
          `[reconcile] plan ${purchase.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `[reconcile] done — plans: ${reconciledPlans}, adaptations: ${reconciledAdaptations}`,
    );

    return {
      reconciledPlans,
      reconciledAdaptations,
      total: reconciledPlans + reconciledAdaptations,
    };
  }

  async listPayments(filters: {
    status?: string;
    userId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: PaymentListRecord[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const dateFilter =
      filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {};

    const where = {
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.status
        ? { status: filters.status as "pending" | "completed" | "failed" }
        : {}),
      ...dateFilter,
    };
    const plans = await this.database.planPurchase.findMany({
      where,
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
    });

    const all = plans
      .map((p) => ({
        checkoutId: p.id,
        type: "plan" as const,
        userId: p.userId,
        userEmail: p.user?.email ?? null,
        planName: planTypeToName(p.planType),
        status: p.status,
        mpPaymentId: p.mpPaymentId ?? null,
        mpPreferenceId: p.mpPreferenceId ?? null,
        externalReference: p.paymentReference,
        amountInCents: p.amountInCents,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    return { items: all.slice(skip, skip + limit), total: all.length };
  }

  async getPaymentDetail(checkoutId: string): Promise<PaymentDetailRecord> {
    const plan = await this.database.planPurchase.findUnique({
      where: { id: checkoutId },
      include: { user: { select: { email: true } } },
    });

    let checkout: PaymentListRecord | null = null;

    if (plan) {
      checkout = {
        checkoutId: plan.id,
        type: "plan",
        userId: plan.userId,
        userEmail: plan.user?.email ?? null,
        planName: planTypeToName(plan.planType),
        status: plan.status,
        mpPaymentId: plan.mpPaymentId ?? null,
        mpPreferenceId: plan.mpPreferenceId ?? null,
        externalReference: plan.paymentReference,
        amountInCents: plan.amountInCents,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
      };
    }

    if (!checkout) throw new NotFoundException("Checkout não encontrado.");

    const rawLogs = await this.database.paymentAuditLog.findMany({
      where: {
        OR: [
          { internalCheckoutId: checkoutId },
          { externalReference: checkout.externalReference ?? "" },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    const auditLogs: PaymentAuditEntry[] = rawLogs.map((l) => ({
      id: l.id,
      eventType: l.eventType,
      actionTaken: l.actionTaken,
      mpPaymentId: l.mpPaymentId ?? null,
      mpMerchantOrderId: l.mpMerchantOrderId ?? null,
      mpStatus: l.mpStatus ?? null,
      errorMessage: l.errorMessage ?? null,
      createdAt: l.createdAt.toISOString(),
    }));

    return { checkout, auditLogs };
  }

  async reconcileOne(checkoutId: string): Promise<{
    reconciled: boolean;
    message: string;
  }> {
    const client = this.getMercadoPagoClient();
    if (!client) {
      return { reconciled: false, message: "MP client não disponível." };
    }

    const plan = await this.database.planPurchase.findUnique({
      where: { id: checkoutId },
    });

    if (plan) {
      if (plan.status === "completed") {
        return { reconciled: false, message: "Pagamento já processado." };
      }
      const paymentClient = new Payment(client);
      const results = await paymentClient.search({
        options: { external_reference: plan.paymentReference },
      });
      const approved = results.results?.find((p) => p.status === "approved");
      if (!approved) {
        return {
          reconciled: false,
          message: "Pagamento não está aprovado no Mercado Pago.",
        };
      }
      const applied = await this.plansService.applyApprovedPurchase(plan.id);
      return {
        reconciled: applied,
        message: applied ? "Plano liberado com sucesso." : "Já processado.",
      };
    }

    throw new NotFoundException("Checkout não encontrado.");
  }

  private getMercadoPagoClient(): MercadoPagoConfig | null {
    const isProduction =
      process.env.MERCADOPAGO_MODE === "production" ||
      process.env.NODE_ENV === "production";
    const token = isProduction
      ? process.env.MERCADOPAGO_ACCESS_TOKEN
      : (process.env.MERCADOPAGO_ACCESS_TOKEN_TEST ??
        process.env.MERCADOPAGO_ACCESS_TOKEN);

    if (!token) return null;
    return new MercadoPagoConfig({ accessToken: token });
  }
}

function mapPaymentStatus(raw: string): CheckoutStatus {
  if (raw === "completed") return "approved";
  if (raw === "failed") return "failed";
  return "pending";
}

function mapNextAction(status: CheckoutStatus): NextAction {
  if (status === "approved") return "show_success";
  if (status === "failed") return "retry_payment";
  return "keep_waiting";
}

function planTypeToName(planType: string): string | null {
  const names: Record<string, string> = {
    starter: "Starter",
    pro: "Pro",
    turbo: "Turbo",
    unlimited: "Ilimitado",
  };
  return names[planType] ?? null;
}

function buildMessage(status: CheckoutStatus, _type: "plan"): string {
  if (status === "approved") {
    return "Pagamento confirmado! Seus créditos estão disponíveis.";
  }
  if (status === "failed") {
    return "Pagamento não aprovado. Tente novamente.";
  }
  return "Aguardando confirmação do pagamento...";
}
