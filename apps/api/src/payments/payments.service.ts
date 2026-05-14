import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import MercadoPagoConfig, { Payment } from "mercadopago";
import {
  BrickPayloadValidationError,
  parseBrickPaymentPayload,
} from "./brick-payload";
import { summarizeSafeError } from "./payment-audit-sanitization";
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
  unitsIncluded: number | null;
  unitPrice: number | null;
};

export type BrickPayResponse = {
  purchaseId: string;
  status: "approved" | "pending";
  checkoutMode: "brick";
  redirectTo: string;
  qrCodeBase64: string | null;
  qrCodeText: string | null;
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
      const latestRejectionLog =
        statusFromPurchase(purchase.status) === "failed"
          ? await this.database.paymentAuditLog.findFirst({
              where: {
                internalCheckoutId: checkoutId,
                eventType: "payment_rejected",
              },
              orderBy: { createdAt: "desc" },
              select: { errorMessage: true },
            })
          : null;
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
        message: buildMessage(status, "plan", latestRejectionLog?.errorMessage ?? null),
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

    const amount = purchase.amountInCents / 100;
    const unitsIncluded =
      purchase.originAction === "unlock_cv"
        ? 1
        : getPlanUnits(purchase.planType);
    const unitPrice =
      unitsIncluded && unitsIncluded > 0 ? amount / unitsIncluded : null;

    return {
      purchaseId: purchase.id,
      amount,
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
      unitsIncluded,
      unitPrice,
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
  ): Promise<BrickPayResponse> {
    const purchase = await this.database.planPurchase.findFirst({
      where: { id: purchaseId, userId },
      select: {
        id: true,
        amountInCents: true,
        paymentReference: true,
        planType: true,
        status: true,
        mpPaymentId: true,
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
      throw new NotFoundException("Checkout não encontrado.");
    }

    if (purchase.status !== "pending") {
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

    let parsedPayload: ReturnType<typeof parseBrickPaymentPayload>;
    try {
      parsedPayload = parseBrickPaymentPayload(payload);
    } catch (error) {
      if (error instanceof BrickPayloadValidationError) {
        throw new BadRequestException({
          errorCode: error.code,
          message: error.message,
        });
      }
      throw new BadRequestException("Payload de pagamento inválido.");
    }

    if (purchase.mpPaymentId) {
      throw new ConflictException({
        errorCode: "brick_payment_in_progress",
        message: "Pagamento em processamento.",
      });
    }

    const lock = await this.database.planPurchase.updateMany({
      where: {
        id: purchase.id,
        userId,
        status: "pending",
        mpPaymentId: null,
      },
      data: {
        status: "processing_payment",
      },
    });

    if (lock.count !== 1) {
      throw new ConflictException({
        errorCode: "brick_payment_in_progress",
        message: "Pagamento em processamento.",
      });
    }

    const correlationId = randomUUID();
    const idempotencyKey = `brick:${purchase.id}:${correlationId}`;
    const payerEmail =
      parsedPayload.payerEmail?.trim() || purchase.user?.email?.trim() || null;
    const payerIdentificationPresent = Boolean(parsedPayload.payerIdentification);

    const paymentAuditLog = (this.database as unknown as {
      paymentAuditLog?: {
        create?: (input: {
          data: Record<string, unknown>;
        }) => Promise<unknown>;
      };
    }).paymentAuditLog;

    void paymentAuditLog
      ?.create?.({
        data: {
          provider: "mercadopago",
          eventType: "brick_payment_create_started",
          actionTaken: "provider_call_pending",
          externalReference: purchase.id,
          internalCheckoutId: purchase.id,
          internalCheckoutType: "plan",
          mpStatus: "processing_payment",
          rawPayload: {
            checkoutMode: "brick",
            idempotencyKey,
            correlationId,
            paymentMethodId: parsedPayload.paymentMethodId,
            payerEmailPresent: Boolean(payerEmail),
            payerIdentificationPresent,
          },
        },
      })
      ?.catch(() => undefined);

    const client = this.getMercadoPagoClient();
    if (!client) {
      await this.database.planPurchase.update({
        where: { id: purchase.id },
        data: { status: "pending" },
      });
      throw new BadRequestException({
        errorCode: "brick_payment_provider_error",
        message: "Pagamento indisponivel no momento. Tente novamente.",
      });
    }

    const paymentClient = new Payment(client);
    const transactionAmount = purchase.amountInCents / 100;
    this.logger.log(
      `[checkout:brick:pay] create_request purchase=${purchase.id} user=${userId} paymentMethod=${parsedPayload.paymentMethodId} payerEmailPresent=${String(Boolean(payerEmail))} payerIdentificationPresent=${String(payerIdentificationPresent)} transactionAmount=${String(transactionAmount)}`,
    );
    const notificationUrlResolution = resolveMercadoPagoNotificationUrl({
      apiUrl: process.env.API_URL,
      fallbackApiUrl: process.env.NEXT_PUBLIC_API_URL,
      routePath: "/api/plans/webhook/mercadopago",
      requireHttps: process.env.NODE_ENV === "production",
    });
    const notificationUrl = notificationUrlResolution.url;
    if (!notificationUrl) {
      const debugId = randomUUID();
      this.logger.error(
        `[checkout:brick:pay] invalid_notification_url debugId=${debugId} apiUrl=${String(process.env.API_URL ?? "")} fallbackApiUrl=${String(process.env.NEXT_PUBLIC_API_URL ?? "")} reason=${notificationUrlResolution.reason}`,
      );
      await this.database.planPurchase.update({
        where: { id: purchase.id },
        data: { status: "pending" },
      });
      const isProduction = process.env.NODE_ENV === "production";
      const message = isProduction
        ? "Notification URL invalida para Mercado Pago. Configure API_URL com URL absoluta valida."
        : `Notification URL invalida para Mercado Pago. reason=${notificationUrlResolution.reason} debugId=${debugId}`;
      throw new BadRequestException({
        errorCode: "brick_notification_url_invalid",
        message,
      });
    }

    try {
      const response = await paymentClient.create({
        body: {
          transaction_amount: transactionAmount,
          payment_method_id: parsedPayload.paymentMethodId,
          ...(parsedPayload.kind === "card"
            ? {
                token: parsedPayload.token,
                installments: parsedPayload.installments,
                ...(parsedPayload.issuerId
                  ? { issuer_id: parsedPayload.issuerId }
                  : {}),
              }
            : {}),
          payer: {
            ...(payerEmail
              ? { email: payerEmail }
              : {}),
            ...(parsedPayload.payerIdentification
              ? { identification: parsedPayload.payerIdentification }
              : {}),
          },
          external_reference: purchase.id,
          description: buildBrickDescription(purchase.planType, purchase.originAction),
          metadata: {
            purchaseId: purchase.id,
            paymentReference: purchase.paymentReference,
            userId,
            planId: purchase.planType,
            originAction: purchase.originAction,
            originAdaptationId: purchase.originAdaptationId,
            source: "payment_brick",
          },
          notification_url: notificationUrl,
        },
        requestOptions: {
          idempotencyKey,
        },
      });

      const mpPaymentId =
        response.id !== undefined && response.id !== null
          ? String(response.id)
          : null;
      const mpStatus = String(response.status ?? "pending");

      if (mpStatus === "approved") {
        await this.database.planPurchase.update({
          where: { id: purchase.id },
          data: {
            mpPaymentId,
          },
        });
        await this.plansService.applyApprovedPurchase(purchase.id);
        return {
          purchaseId: purchase.id,
          status: "approved",
          checkoutMode: "brick",
          redirectTo: `/pagamento/concluido?checkoutId=${purchase.id}`,
          qrCodeBase64: null,
          qrCodeText: null,
        };
      }

      if (
        mpStatus === "rejected" ||
        mpStatus === "cancelled" ||
        mpStatus === "charged_back" ||
        mpStatus === "refunded"
      ) {
        const rejectionDetail = summarizePaymentRejection(response);
        await this.database.planPurchase.update({
          where: { id: purchase.id },
          data: {
            mpPaymentId,
            status: "pending",
          },
        });
        const isProduction = process.env.NODE_ENV === "production";
        const message = isProduction
          ? "Pagamento recusado. Verifique os dados ou tente outro meio de pagamento."
          : `Pagamento recusado. Verifique os dados ou tente outro meio de pagamento. Detalhe: ${rejectionDetail}`;
        throw new BadRequestException({
          errorCode: "brick_payment_rejected",
          message,
        });
      }

      if (mpStatus === "pending" || mpStatus === "in_process") {
        const pixData = extractPixTransactionData(response);
        await this.database.planPurchase.update({
          where: { id: purchase.id },
          data: {
            mpPaymentId,
            status: "pending_payment",
          },
        });
        return {
          purchaseId: purchase.id,
          status: "pending",
          checkoutMode: "brick",
          redirectTo: `/pagamento/pendente?checkoutId=${purchase.id}`,
          qrCodeBase64: pixData.qrCodeBase64,
          qrCodeText: pixData.qrCodeText,
        };
      }

      const pixData = extractPixTransactionData(response);
      await this.database.planPurchase.update({
        where: { id: purchase.id },
        data: {
          mpPaymentId,
          status: "pending_payment",
        },
      });
      return {
        purchaseId: purchase.id,
        status: "pending",
        checkoutMode: "brick",
        redirectTo: `/pagamento/pendente?checkoutId=${purchase.id}`,
        qrCodeBase64: pixData.qrCodeBase64,
        qrCodeText: pixData.qrCodeText,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const debugId = randomUUID();
      const providerDetail = summarizeProviderError(error);
      this.logger.error(
        `[checkout:brick:pay] provider_error debugId=${debugId} purchase=${purchase.id} user=${userId} paymentMethod=${parsedPayload.paymentMethodId} payerEmailPresent=${String(Boolean(payerEmail))} payerIdentificationPresent=${String(Boolean(parsedPayload.payerIdentification))} detail=${providerDetail}`,
      );
      await this.database.planPurchase.update({
        where: { id: purchase.id },
        data: { status: "pending_payment" },
      });

      const isProduction = process.env.NODE_ENV === "production";
      const safeMessage = isProduction
        ? "Nao foi possivel processar o pagamento agora. Tente novamente em instantes."
        : `Nao foi possivel processar o pagamento agora. Detalhe: ${providerDetail}. debugId=${debugId}`;
      throw new BadRequestException({
        errorCode: "brick_payment_provider_error",
        message: safeMessage,
      });
    }
  }

  async reconcilePending(limit = 50): Promise<{
    reconciledPlans: number;
    reconciledAdaptations: number;
    total: number;
  }> {
    const pendingPurchases = await this.database.planPurchase.findMany({
      where: { status: { in: ["pending", "processing_payment", "pending_payment"] } },
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
    const token = this.getBrickAccessToken();
    if (!token) return null;
    return new MercadoPagoConfig({ accessToken: token });
  }

  private getBrickAccessToken(): string | null {
    const explicit = process.env.MERCADOPAGO_BRICK_ACCESS_TOKEN?.trim();
    if (explicit) {
      return explicit;
    }

    const isProduction =
      process.env.MERCADOPAGO_MODE === "production" ||
      process.env.NODE_ENV === "production";
    const token = isProduction
      ? process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()
      : (process.env.MERCADOPAGO_BRICK_ACCESS_TOKEN_TEST ??
        process.env.MERCADOPAGO_ACCESS_TOKEN_TEST ??
        process.env.MERCADOPAGO_ACCESS_TOKEN)?.trim();

    return token || null;
  }

  private async evaluateBrickEligibility(userId: string): Promise<{
    useBrick: boolean;
    reason: string;
  }> {
    const mode = (process.env.PAYMENT_CHECKOUT_MODE ?? "pro").trim().toLowerCase();

    if (mode !== "brick") {
      return { useBrick: false, reason: "mode_not_brick" };
    }

    void userId;
    return { useBrick: true, reason: "mode_brick" };
  }
}

function summarizeProviderError(error: unknown): string {
  return summarizeSafeError(error);
}

function summarizePaymentRejection(paymentResponse: unknown): string {
  if (!paymentResponse || typeof paymentResponse !== "object") {
    return "status=rejected";
  }

  const source = paymentResponse as {
    status?: unknown;
    status_detail?: unknown;
    payment_method_id?: unknown;
  };
  const status = normalizeOptionalString(source.status) ?? "rejected";
  const statusDetail = normalizeOptionalString(source.status_detail) ?? "unknown";
  const paymentMethodId = normalizeOptionalString(source.payment_method_id);

  if (!paymentMethodId) {
    return `status=${status}; detail=${statusDetail}`;
  }

  return `status=${status}; detail=${statusDetail}; method=${paymentMethodId}`;
}

function extractPixTransactionData(response: unknown): {
  qrCodeBase64: string | null;
  qrCodeText: string | null;
} {
  if (!response || typeof response !== "object") {
    return { qrCodeBase64: null, qrCodeText: null };
  }

  const pointOfInteraction = (response as { point_of_interaction?: unknown })
    .point_of_interaction;
  if (!pointOfInteraction || typeof pointOfInteraction !== "object") {
    return { qrCodeBase64: null, qrCodeText: null };
  }

  const transactionData = (
    pointOfInteraction as { transaction_data?: unknown }
  ).transaction_data;
  if (!transactionData || typeof transactionData !== "object") {
    return { qrCodeBase64: null, qrCodeText: null };
  }

  const qrCodeBase64 = normalizeOptionalString(
    (transactionData as { qr_code_base64?: unknown }).qr_code_base64,
  );
  const qrCodeText = normalizeOptionalString(
    (transactionData as { qr_code?: unknown }).qr_code,
  );

  return { qrCodeBase64, qrCodeText };
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveMercadoPagoNotificationUrl(input: {
  apiUrl?: string;
  fallbackApiUrl?: string;
  routePath: string;
  requireHttps: boolean;
}): { url: string | null; reason: string } {
  const candidateRaw = input.apiUrl?.trim() || input.fallbackApiUrl?.trim();
  if (!candidateRaw) return { url: null, reason: "missing_base_url" };

  let base: URL;
  try {
    base = new URL(candidateRaw);
  } catch {
    return { url: null, reason: "base_url_parse_failed" };
  }

  const protocol = base.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return { url: null, reason: `unsupported_protocol:${protocol}` };
  }

  if (input.requireHttps && protocol !== "https:") {
    return { url: null, reason: "https_required_in_production" };
  }

  const normalizedBasePath = base.pathname.endsWith("/")
    ? base.pathname.slice(0, -1)
    : base.pathname;
  const routePath = input.routePath.startsWith("/")
    ? input.routePath
    : `/${input.routePath}`;

  const finalPath = normalizedBasePath.endsWith("/api")
    ? `${normalizedBasePath}${routePath.replace(/^\/api/, "")}`
    : `${normalizedBasePath}${routePath}`;

  base.pathname = finalPath;
  base.search = "";
  base.hash = "";
  return { url: base.toString(), reason: "ok" };
}

function statusFromPurchase(raw: string): CheckoutStatus {
  if (raw === "completed") return "approved";
  if (raw === "failed") return "failed";
  return "pending";
}

function mapPaymentStatus(raw: string): CheckoutStatus {
  return statusFromPurchase(raw);
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

function buildMessage(
  status: CheckoutStatus,
  _type: "plan",
  failureDetail: string | null,
): string {
  if (status === "approved") {
    return "Pagamento confirmado! Seus créditos estão disponíveis.";
  }
  if (status === "failed") {
    if (failureDetail === "cc_rejected_high_risk") {
      return "Pagamento recusado por analise de risco. Tente outro cartao ou Pix.";
    }
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

function getPlanUnits(planType: string): number | null {
  if (planType === "starter") return requireEnvInt("QNT_CV_PLAN_STARTER");
  if (planType === "pro") return requireEnvInt("QNT_CV_PLAN_PRO");
  if (planType === "turbo") return requireEnvInt("QNT_CV_PLAN_TURBO");
  return null;
}

function requireEnvInt(...names: string[]): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw) {
      const value = parseInt(raw, 10);
      if (isNaN(value)) {
        throw new Error(`Env var ${name} must be a valid integer, got: "${raw}"`);
      }
      return value;
    }
  }
  throw new Error(`Required env var(s) [${names.join(", ")}] are not set`);
}
