import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type {
  MockInterviewOrigin,
  MockInterviewPurchase,
  PaymentStatus,
  Prisma,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { sanitizePaymentAuditPayload } from "../payments/payment-audit-sanitization";
import {
  buildWhatsappUrl,
  getMockInterviewAmountInCents,
  getWhatsappNumber,
  MOCK_INTERVIEW_PRODUCT,
  purchaseCode,
  purchaseIdFromExternalReference,
  toExternalReference,
} from "./mock-interview.config";
import {
  checkMercadoPagoSignature,
  extractWebhookPaymentId,
  getMercadoPagoWebhookSecrets,
  MockInterviewMercadoPagoGateway,
  type NormalizedMpPayment,
} from "./mock-interview-mercadopago";
import { MockInterviewNotificationsService } from "./mock-interview-notifications.service";

// Pendente de pagamento: pode virar aprovado. "failed" entra de propósito —
// no Checkout Pro a pessoa pode ter um cartão recusado e pagar em seguida
// (Pix) na MESMA preferência.
const APPROVABLE_STATUSES: PaymentStatus[] = [
  "none",
  "pending",
  "processing_payment",
  "pending_payment",
  "failed",
];
const OPEN_STATUSES: PaymentStatus[] = [
  "none",
  "pending",
  "processing_payment",
  "pending_payment",
];
const CHECKOUT_REUSE_WINDOW_MS = 60 * 60_000;
const RECONCILE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export type PublicPaymentStatus = "pending" | "paid" | "failed" | "refunded";

export function toPublicPaymentStatus(
  status: PaymentStatus,
): PublicPaymentStatus {
  if (status === "completed") return "paid";
  if (status === "refunded") return "refunded";
  if (status === "failed") return "failed";
  return "pending";
}

export type MockInterviewPurchaseView = {
  id: string;
  code: string;
  amountInCents: number;
  currency: string;
  paymentStatus: PublicPaymentStatus;
  sessionStatus: MockInterviewPurchase["sessionStatus"];
  scheduledAt: string | null;
  meetingUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  // Só preenchido com pagamento confirmado (e não estornado). Nunca expõe o
  // número antes disso.
  whatsappUrl: string | null;
  whatsappConfigured: boolean;
};

export function buildPurchaseView(
  purchase: Pick<
    MockInterviewPurchase,
    | "id"
    | "amountInCents"
    | "currency"
    | "paymentStatus"
    | "sessionStatus"
    | "scheduledAt"
    | "meetingUrl"
    | "createdAt"
    | "paidAt"
  >,
  buyerName: string | null,
  whatsappNumber: string | null = getWhatsappNumber(),
): MockInterviewPurchaseView {
  const paymentStatus = toPublicPaymentStatus(purchase.paymentStatus);
  const unlocked = paymentStatus === "paid";
  return {
    id: purchase.id,
    code: purchaseCode(purchase.id),
    amountInCents: purchase.amountInCents,
    currency: purchase.currency,
    paymentStatus,
    sessionStatus: purchase.sessionStatus,
    scheduledAt: purchase.scheduledAt?.toISOString() ?? null,
    meetingUrl: unlocked ? purchase.meetingUrl : null,
    createdAt: purchase.createdAt.toISOString(),
    paidAt: purchase.paidAt?.toISOString() ?? null,
    whatsappUrl:
      unlocked && whatsappNumber
        ? buildWhatsappUrl({
            number: whatsappNumber,
            purchaseId: purchase.id,
            buyerName,
          })
        : null,
    whatsappConfigured: whatsappNumber !== null,
  };
}

export type ApplyResult =
  | "approved"
  | "already_approved"
  | "refunded"
  | "failed"
  | "pending"
  | "amount_mismatch"
  | "not_found"
  | "ignored";

@Injectable()
export class MockInterviewsService {
  private readonly logger = new Logger(MockInterviewsService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MockInterviewMercadoPagoGateway)
    private readonly gateway: Pick<
      MockInterviewMercadoPagoGateway,
      "createPreference" | "getPayment" | "findLatestByExternalReference"
    >,
    @Inject(MockInterviewNotificationsService)
    private readonly notifications: Pick<
      MockInterviewNotificationsService,
      "notifyPurchaseApproved"
    >,
  ) {}

  // amountInCents null = preço não configurado (venda fechada).
  getOffer() {
    return {
      title: MOCK_INTERVIEW_PRODUCT.title,
      amountInCents: getMockInterviewAmountInCents(),
      currency: MOCK_INTERVIEW_PRODUCT.currency,
      durationMinutes: MOCK_INTERVIEW_PRODUCT.durationMinutes,
      offerLabel: MOCK_INTERVIEW_PRODUCT.offerLabel,
      refundHoursBefore: MOCK_INTERVIEW_PRODUCT.refundHoursBefore,
      rescheduleHoursBefore: MOCK_INTERVIEW_PRODUCT.rescheduleHoursBefore,
      policyVersion: MOCK_INTERVIEW_PRODUCT.policyVersion,
    };
  }

  async createCheckout(
    userId: string,
    input: {
      acceptPolicy: boolean;
      origin?: MockInterviewOrigin;
      jobApplicationId?: string;
    },
    now: Date = new Date(),
  ): Promise<{ purchaseId: string; checkoutUrl: string }> {
    if (input.acceptPolicy !== true) {
      throw new BadRequestException(
        "É preciso aceitar as regras de reembolso e remarcação.",
      );
    }

    const amountInCents = getMockInterviewAmountInCents();
    if (amountInCents === null) {
      this.logger.error(
        "[mock-interview] checkout refused: PRICE_INTERVIEW_SIM not configured",
      );
      throw new ServiceUnavailableException(
        "A venda está indisponível no momento. Tente de novo mais tarde.",
      );
    }

    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException("Usuário não encontrado.");

    // Candidatura de origem só vale se for do próprio usuário.
    let jobApplicationId: string | null = null;
    if (input.jobApplicationId) {
      const application = await this.database.jobApplication.findFirst({
        where: { id: input.jobApplicationId, userId, deletedAt: null },
        select: { id: true },
      });
      jobApplicationId = application?.id ?? null;
    }
    const origin: MockInterviewOrigin = input.origin ?? "landing";

    // Reaproveita um checkout aberto e idêntico (mesmo valor, sem pagamento
    // iniciado) para não acumular pedidos pendentes a cada clique.
    const reusable = await this.database.mockInterviewPurchase.findFirst({
      where: {
        userId,
        paymentStatus: { in: ["none", "pending"] },
        mpPaymentId: null,
        amountInCents,
        currency: MOCK_INTERVIEW_PRODUCT.currency,
        policyVersion: MOCK_INTERVIEW_PRODUCT.policyVersion,
        origin,
        originJobApplicationId: jobApplicationId,
        createdAt: { gte: new Date(now.getTime() - CHECKOUT_REUSE_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });

    const purchase =
      reusable ??
      (await this.database.mockInterviewPurchase.create({
        data: {
          userId,
          amountInCents,
          currency: MOCK_INTERVIEW_PRODUCT.currency,
          paymentStatus: "pending",
          origin,
          originJobApplicationId: jobApplicationId,
          policyVersion: MOCK_INTERVIEW_PRODUCT.policyVersion,
          policyAcceptedAt: now,
          events: {
            create: {
              type: "checkout_created",
              actor: `user:${userId}`,
              toValue: "pending",
              metadata: { origin, jobApplicationId },
            },
          },
        },
      }));

    try {
      const { checkoutUrl, preferenceId } = await this.gateway.createPreference(
        {
          purchaseId: purchase.id,
          amountInCents: purchase.amountInCents,
          payer: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)
            ? { email: user.email, ...(user.name ? { name: user.name } : {}) }
            : undefined,
        },
      );

      if (preferenceId) {
        await this.database.mockInterviewPurchase.update({
          where: { id: purchase.id },
          data: { mpPreferenceId: preferenceId },
        });
      }
      this.audit({
        eventType: "checkout_created",
        actionTaken: "preference_created",
        purchaseId: purchase.id,
        mpPreferenceId: preferenceId,
      });
      return { purchaseId: purchase.id, checkoutUrl };
    } catch (error) {
      this.logger.error(
        `[mock-interview] preference failed purchaseId=${purchase.id} reason=${error instanceof Error ? error.message : String(error)}`,
      );
      this.audit({
        eventType: "checkout_error",
        actionTaken: "error",
        purchaseId: purchase.id,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new ServiceUnavailableException(
        "Pagamento indisponível no momento. Tente de novo em instantes.",
      );
    }
  }

  async listMine(userId: string): Promise<MockInterviewPurchaseView[]> {
    const [user, purchases] = await Promise.all([
      this.database.user.findUnique({
        where: { id: userId },
        select: { name: true },
      }),
      this.database.mockInterviewPurchase.findMany({
        where: { userId, paymentStatus: { in: ["completed", "refunded"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    return purchases.map((p) => buildPurchaseView(p, user?.name ?? null));
  }

  // Página do pedido (retorno do Mercado Pago). Com refresh, um pedido ainda
  // pendente é conferido direto na API do MP — cobre webhook atrasado.
  async getMine(
    userId: string,
    purchaseId: string,
    options: { refresh?: boolean } = {},
    now: Date = new Date(),
  ): Promise<MockInterviewPurchaseView> {
    let purchase = await this.database.mockInterviewPurchase.findFirst({
      where: { id: purchaseId, userId },
      include: { user: { select: { name: true } } },
    });
    if (!purchase) throw new NotFoundException("Pedido não encontrado.");

    if (
      options.refresh &&
      OPEN_STATUSES.concat("failed").includes(purchase.paymentStatus) &&
      now.getTime() - purchase.createdAt.getTime() < RECONCILE_MAX_AGE_MS
    ) {
      const result = await this.reconcile(purchase.id);
      if (result !== "ignored" && result !== "pending") {
        purchase =
          (await this.database.mockInterviewPurchase.findFirst({
            where: { id: purchaseId, userId },
            include: { user: { select: { name: true } } },
          })) ?? purchase;
      }
    }

    return buildPurchaseView(purchase, purchase.user.name);
  }

  // Confere o pagamento mais recente do pedido na API do MP. Nunca lança.
  async reconcile(purchaseId: string): Promise<ApplyResult> {
    try {
      const payment = await this.gateway.findLatestByExternalReference(
        toExternalReference(purchaseId),
      );
      if (!payment) return "pending";
      return await this.applyPayment(purchaseId, payment, "reconcile");
    } catch (error) {
      this.logger.warn(
        `[mock-interview] reconcile failed purchaseId=${purchaseId} reason=${error instanceof Error ? error.message : String(error)}`,
      );
      return "ignored";
    }
  }

  // ---- Webhook ------------------------------------------------------------

  async handleWebhook(input: {
    body: unknown;
    xSignature?: string;
    xRequestId?: string;
  }): Promise<{ result: ApplyResult }> {
    const signature = checkMercadoPagoSignature({
      secrets: getMercadoPagoWebhookSecrets(),
      body: input.body,
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
    });
    if (signature !== "valid" && signature !== "no_secret_configured") {
      this.audit({
        eventType: "webhook_received",
        actionTaken: "invalid_signature",
        errorMessage: signature,
        rawPayload: input.body,
      });
      throw new UnauthorizedException("Invalid webhook signature");
    }

    const paymentId = extractWebhookPaymentId(input.body);
    if (!paymentId) return { result: "ignored" };

    let payment: NormalizedMpPayment | null;
    try {
      payment = await this.gateway.getPayment(paymentId);
    } catch (error) {
      // 200 para o MP não insistir para sempre; a reconciliação na página
      // do pedido e o próximo aviso do MP cobrem o caso.
      this.audit({
        eventType: "unexpected_error",
        actionTaken: "error",
        mpPaymentId: paymentId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return { result: "ignored" };
    }
    if (!payment) return { result: "ignored" };

    const purchaseId = purchaseIdFromExternalReference(
      payment.externalReference,
    );
    if (!purchaseId) {
      // Pagamento de outro fluxo (créditos) — não é deste webhook.
      return { result: "ignored" };
    }

    return { result: await this.applyPayment(purchaseId, payment, "webhook") };
  }

  // Único ponto que muda o status de pagamento (webhook e reconciliação).
  // Toda transição é um updateMany CONDICIONAL ao status atual: sob
  // concorrência (dois webhooks, webhook + reconciliação) só um vence.
  async applyPayment(
    purchaseId: string,
    payment: NormalizedMpPayment,
    actor: "webhook" | "reconcile",
  ): Promise<ApplyResult> {
    const purchase = await this.database.mockInterviewPurchase.findUnique({
      where: { id: purchaseId },
    });
    const auditBase = {
      purchaseId,
      mpPaymentId: payment.paymentId,
      mpPreferenceId: payment.preferenceId,
      mpMerchantOrderId: payment.merchantOrderId,
      externalReference: payment.externalReference,
      mpStatus: payment.rawStatus,
    };

    if (!purchase) {
      this.audit({
        ...auditBase,
        eventType: "webhook_received",
        actionTaken: "ignored",
        errorMessage: "mock interview purchase not found",
      });
      return "not_found";
    }

    if (payment.status === "approved") {
      if (purchase.paymentStatus === "completed") return "already_approved";

      // Valor e moeda pagos precisam bater com o snapshot do pedido.
      if (
        payment.paidAmountInCents !== purchase.amountInCents ||
        (payment.paidCurrency && payment.paidCurrency !== purchase.currency)
      ) {
        this.logger.error(
          `[mock-interview] amount mismatch purchaseId=${purchaseId} expected=${purchase.amountInCents}${purchase.currency} paid=${payment.paidAmountInCents}${payment.paidCurrency ?? "-"}`,
        );
        this.audit({
          ...auditBase,
          eventType: "payment_amount_mismatch",
          actionTaken: "ignored",
          errorMessage: `expected=${purchase.amountInCents}${purchase.currency} paid=${payment.paidAmountInCents}${payment.paidCurrency ?? "-"}`,
        });
        await this.recordEvent(purchaseId, {
          type: "payment_amount_mismatch",
          actor,
          note: `Pago ${payment.paidAmountInCents ?? "?"} ${payment.paidCurrency ?? ""}, esperado ${purchase.amountInCents} ${purchase.currency}`,
        });
        return "amount_mismatch";
      }

      const transition = await this.database.mockInterviewPurchase.updateMany({
        where: { id: purchaseId, paymentStatus: { in: APPROVABLE_STATUSES } },
        data: {
          paymentStatus: "completed",
          paidAt: new Date(),
          mpPaymentId: payment.paymentId,
          paymentMethod: payment.paymentMethod,
          ...(payment.merchantOrderId
            ? { mpMerchantOrderId: payment.merchantOrderId }
            : {}),
          ...(payment.preferenceId && !purchase.mpPreferenceId
            ? { mpPreferenceId: payment.preferenceId }
            : {}),
        },
      });
      if (transition.count !== 1) {
        this.audit({
          ...auditBase,
          eventType: "webhook_duplicated",
          actionTaken: "duplicated",
        });
        return "already_approved";
      }

      await this.recordEvent(purchaseId, {
        type: "payment_approved",
        actor,
        fromValue: purchase.paymentStatus,
        toValue: "completed",
        metadata: {
          mpPaymentId: payment.paymentId,
          method: payment.paymentMethod,
        },
      });
      this.audit({
        ...auditBase,
        eventType: "payment_approved",
        actionTaken: "approved",
      });
      await this.notifications.notifyPurchaseApproved(purchaseId);
      return "approved";
    }

    if (payment.status === "refunded") {
      const transition = await this.database.mockInterviewPurchase.updateMany({
        where: { id: purchaseId, paymentStatus: "completed" },
        data: {
          paymentStatus: "refunded",
          refundedAt: new Date(),
          ...(purchase.sessionStatus === "AWAITING_SCHEDULING" ||
          purchase.sessionStatus === "SCHEDULED"
            ? { sessionStatus: "REFUNDED" }
            : {}),
        },
      });
      if (transition.count !== 1) return "ignored";
      await this.recordEvent(purchaseId, {
        type: "payment_refunded",
        actor,
        fromValue: "completed",
        toValue: "refunded",
        note: payment.rawStatus === "charged_back" ? "Chargeback" : null,
      });
      this.audit({
        ...auditBase,
        eventType: "payment_refunded",
        actionTaken: "refunded",
      });
      return "refunded";
    }

    if (payment.status === "failed") {
      const transition = await this.database.mockInterviewPurchase.updateMany({
        where: { id: purchaseId, paymentStatus: { in: OPEN_STATUSES } },
        data: { paymentStatus: "failed" },
      });
      if (transition.count === 1) {
        await this.recordEvent(purchaseId, {
          type: "payment_failed",
          actor,
          fromValue: purchase.paymentStatus,
          toValue: "failed",
          note: payment.statusDetail,
        });
        this.audit({
          ...auditBase,
          eventType: "payment_rejected",
          actionTaken: "failed",
          errorMessage: payment.statusDetail ?? payment.rawStatus,
        });
      }
      return "failed";
    }

    // Pendente (ex.: Pix gerado e ainda não pago).
    await this.database.mockInterviewPurchase.updateMany({
      where: { id: purchaseId, paymentStatus: { in: ["none", "pending"] } },
      data: { paymentStatus: "pending_payment" },
    });
    return "pending";
  }

  private async recordEvent(
    purchaseId: string,
    input: {
      type: string;
      actor: string;
      fromValue?: string | null;
      toValue?: string | null;
      note?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    try {
      await this.database.mockInterviewEvent.create({
        data: {
          purchaseId,
          type: input.type,
          actor: input.actor,
          fromValue: input.fromValue ?? null,
          toValue: input.toValue ?? null,
          note: input.note ?? null,
          ...(input.metadata
            ? { metadata: input.metadata as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch (error) {
      this.logger.error(
        `[mock-interview] event write failed purchaseId=${purchaseId} type=${input.type}: ${String(error)}`,
      );
    }
  }

  // Trilha no mesmo PaymentAuditLog dos demais pagamentos
  // (internalCheckoutType="mock_interview"). Nunca bloqueia.
  private audit(entry: {
    eventType: string;
    actionTaken: string;
    purchaseId?: string;
    mpPaymentId?: string | null;
    mpPreferenceId?: string | null;
    mpMerchantOrderId?: string | null;
    externalReference?: string | null;
    mpStatus?: string | null;
    errorMessage?: string | null;
    rawPayload?: unknown;
  }) {
    const sanitized = sanitizePaymentAuditPayload(entry.rawPayload);
    this.database.paymentAuditLog
      .create({
        data: {
          provider: "mercadopago",
          eventType: entry.eventType,
          actionTaken: entry.actionTaken,
          mpPaymentId: entry.mpPaymentId ?? null,
          mpPreferenceId: entry.mpPreferenceId ?? null,
          mpMerchantOrderId: entry.mpMerchantOrderId ?? null,
          externalReference:
            entry.externalReference ??
            (entry.purchaseId ? toExternalReference(entry.purchaseId) : null),
          internalCheckoutId: entry.purchaseId ?? null,
          internalCheckoutType: "mock_interview",
          mpStatus: entry.mpStatus ?? null,
          errorMessage: entry.errorMessage ?? null,
          ...(sanitized != null
            ? { rawPayload: sanitized as Prisma.InputJsonValue }
            : {}),
        },
      })
      .catch((error: unknown) => {
        this.logger.error(
          `[mock-interview] audit write failed: ${String(error)}`,
        );
      });
  }
}
