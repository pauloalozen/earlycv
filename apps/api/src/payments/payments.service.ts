import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
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

export type BrickCheckoutDataResponse = {
  purchaseId: string;
  amount: number;
  currency: string;
  description: string;
  status: "pending";
  originAction: "buy_credits" | "unlock_cv";
  originAdaptationId: string | null;
  payerEmail: string | null;
  checkoutMode: "brick";
};

export type BrickPayDryRunResponse = {
  dryRun: true;
  purchaseId: string;
  status: "validated";
  checkoutMode: "brick";
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

  async getBrickCheckoutData(
    userId: string,
    purchaseId: string,
  ): Promise<BrickCheckoutDataResponse> {
    const eligibility = await this.evaluateBrickEligibility(userId);
    if (!eligibility.useBrick) {
      this.logBrickCheckoutGuard("brick_not_eligible", purchaseId, userId);
      throw new ForbiddenException({
        errorCode: "brick_not_eligible",
        message: "Checkout Brick não habilitado para este usuário.",
      });
    }

    const purchase = await this.database.planPurchase.findFirst({
      where: { id: purchaseId, userId },
      select: {
        id: true,
        amountInCents: true,
        currency: true,
        status: true,
        planType: true,
        originAction: true,
        originAdaptationId: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!purchase) {
      this.logBrickCheckoutGuard("purchase_not_found", purchaseId, userId);
      throw new NotFoundException({
        errorCode: "purchase_not_found",
        message: "Checkout não encontrado.",
      });
    }

    if (purchase.status !== "pending") {
      this.logBrickCheckoutGuard(
        `purchase_status_invalid:${purchase.status}`,
        purchaseId,
        userId,
      );
      throw new ConflictException({
        errorCode: "purchase_status_invalid",
        message: "Checkout indisponível para este status.",
      });
    }

    if (purchase.amountInCents <= 0) {
      this.logBrickCheckoutGuard("purchase_amount_invalid", purchaseId, userId);
      throw new ConflictException({
        errorCode: "purchase_amount_invalid",
        message: "Checkout com valor inválido.",
      });
    }

    if (
      purchase.originAction === "unlock_cv" &&
      !purchase.originAdaptationId?.trim()
    ) {
      this.logBrickCheckoutGuard("purchase_origin_invalid", purchaseId, userId);
      throw new ConflictException({
        errorCode: "purchase_origin_invalid",
        message: "Checkout com origem inválida.",
      });
    }

    return {
      purchaseId: purchase.id,
      amount: purchase.amountInCents / 100,
      currency: purchase.currency,
      description: buildBrickDescription(
        purchase.planType,
        purchase.originAction,
      ),
      status: purchase.status,
      originAction: purchase.originAction,
      originAdaptationId: purchase.originAdaptationId,
      payerEmail: purchase.user?.email ?? null,
      checkoutMode: "brick",
    };
  }

  private logBrickCheckoutGuard(
    reason: string,
    purchaseId: string,
    userId: string,
  ): void {
    if (process.env.NODE_ENV === "production") return;
    this.logger.warn(
      `[checkout:brick:get] blocked reason=${reason} purchase=${purchaseId} user=${userId}`,
    );
  }

  async submitBrickPayment(
    userId: string,
    purchaseId: string,
    payload: unknown,
  ): Promise<BrickPayDryRunResponse> {
    const purchase = await this.database.planPurchase.findFirst({
      where: { id: purchaseId, userId },
      select: {
        id: true,
        amountInCents: true,
        status: true,
        originAction: true,
        originAdaptationId: true,
      },
    });

    if (!purchase) {
      throw new NotFoundException("Checkout não encontrado.");
    }

    if (purchase.status !== "pending" && purchase.status !== "none") {
      throw new NotFoundException("Checkout não encontrado.");
    }

    if (purchase.amountInCents <= 0) {
      throw new NotFoundException("Checkout não encontrado.");
    }

    if (
      purchase.originAction === "unlock_cv" &&
      !purchase.originAdaptationId?.trim()
    ) {
      throw new NotFoundException("Checkout não encontrado.");
    }

    const eligibility = await this.evaluateBrickEligibility(userId);
    if (!eligibility.useBrick) {
      throw new ForbiddenException("Checkout Brick não habilitado para este usuário.");
    }

    if (!payload || typeof payload !== "object") {
      throw new BadRequestException("Payload de pagamento inválido.");
    }

    const dryRunEnabled =
      (process.env.PAYMENT_BRICK_DRY_RUN ?? "true").trim().toLowerCase() ===
      "true";

    if (!dryRunEnabled) {
      throw new BadRequestException(
        "Real payment flow not implemented yet. Enable PAYMENT_BRICK_DRY_RUN=true.",
      );
    }

    const payloadKeys = Object.keys(payload as Record<string, unknown>);
    const hasAnyInput = payloadKeys.length > 0;
    if (!hasAnyInput) {
      throw new BadRequestException("Payload de pagamento inválido.");
    }

    this.logger.log(
      `[checkout:brick] dry_run_validated purchase=${purchase.id} user=${userId} status=${purchase.status}`,
    );

    return {
      dryRun: true,
      purchaseId: purchase.id,
      status: "validated",
      checkoutMode: "brick",
      message: "Brick payload validated. No Mercado Pago payment was created.",
    };
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

  private async evaluateBrickEligibility(userId: string): Promise<{
    useBrick: boolean;
    reason: string;
  }> {
    const mode = (process.env.PAYMENT_CHECKOUT_MODE ?? "pro").trim();
    const enabled =
      (process.env.PAYMENT_BRICK_ENABLED ?? "false").trim().toLowerCase() ===
      "true";

    if (mode !== "brick") {
      return { useBrick: false, reason: "mode_not_brick" };
    }

    if (!enabled) {
      return { useBrick: false, reason: "brick_disabled" };
    }

    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      return { useBrick: false, reason: "user_not_found" };
    }

    const allowedUserIds = parseCsvList(process.env.PAYMENT_BRICK_ALLOWED_USER_IDS);
    const allowedEmails = parseCsvList(process.env.PAYMENT_BRICK_ALLOWED_EMAILS).map(
      (value) => value.toLowerCase(),
    );

    if (allowedUserIds.length === 0 && allowedEmails.length === 0) {
      return { useBrick: true, reason: "global_enabled_no_allowlist" };
    }

    const normalizedUserId = user.id.trim();
    const normalizedEmail = user.email.trim().toLowerCase();
    const userIdMatch = allowedUserIds.includes(normalizedUserId);
    const emailMatch = allowedEmails.includes(normalizedEmail);

    if (userIdMatch || emailMatch) {
      return { useBrick: true, reason: "allowlist_match" };
    }

    return { useBrick: false, reason: "allowlist_miss" };
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

function buildBrickDescription(
  planType: string,
  originAction: "buy_credits" | "unlock_cv",
): string {
  const planName = planTypeToName(planType);
  if (originAction === "unlock_cv") {
    return planName
      ? `EarlyCV - desbloqueio de CV (${planName})`
      : "EarlyCV - desbloqueio de CV";
  }

  return planName ? `EarlyCV - pacote ${planName}` : "EarlyCV - pacote";
}

function parseCsvList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
