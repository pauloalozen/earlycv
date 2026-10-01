import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import type { Prisma, UserPlanType } from "@prisma/client";
import MercadoPagoConfig, { Payment, Preference } from "mercadopago";

import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import type { ProductOrigin } from "../analysis-observability/product-origin";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import { CvAdaptationService } from "../cv-adaptation/cv-adaptation.service";
import { DatabaseService } from "../database/database.service";
import { EmailDispatchService } from "../email-dispatch/email-dispatch.service";
import { Ga4MeasurementService } from "../ga4/ga4-measurement.service";
import {
  buildMercadoPagoItemMetadata,
  buildMercadoPagoReturnConfig,
} from "../payments/mercado-pago-return-config";
import { sanitizePaymentAuditPayload } from "../payments/payment-audit-sanitization";
import {
  type CouponCheckoutResult,
  CouponResolutionService,
} from "./coupon-resolution.service";

export type PlanId = "starter" | "pro" | "turbo";

type MercadoPagoPaymentResolution = {
  purchaseId: string | null;
  externalReference: string | null;
  paymentReference: string | null;
  status: "approved" | "failed" | "refunded" | "pending" | "unknown";
  paymentId: string | null;
  merchantOrderId: string | null;
  preferenceId: string | null;
  rawStatus: string | null;
  statusDetail: string | null;
  // payment_type_id real da API do Mercado Pago (ex.: "pix",
  // "credit_card", "debit_card", "bank_transfer") — null quando o
  // payload não trouxe o campo, nunca inferido/adivinhado.
  paymentMethod: string | null;
  // Valor e moeda efetivamente pagos, lidos de transaction_amount/
  // currency_id da API do MP — conferidos contra o pedido persistido antes
  // de creditar (nunca confia só no external_reference bater).
  paidAmountInCents: number | null;
  paidCurrency: string | null;
};

type PaymentFailureEnrichmentInput = {
  paymentReference: string;
  paymentId: string | null;
  merchantOrderId: string | null;
  preferenceId: string | null;
  rawStatus: string | null;
  statusDetail: string | null;
  paymentMethod: string | null;
};

type ApprovedPaymentEventInput = {
  purchase: {
    id: string;
    userId: string;
    planType: string;
    amountInCents?: number;
    currency?: string;
    paymentReference: string;
    creditsGranted: number;
    originAction: PurchaseOriginAction;
    originAdaptationId: string | null;
    mpPaymentId?: string | null;
    mpPreferenceId?: string | null;
    metadataJson?: unknown;
  };
  paymentId?: string | null;
  paymentReference?: string | null;
  checkoutMode?: "brick" | "checkout_pro" | null;
  correlationId?: string;
  requestId?: string;
  routePath?: string;
  routeKey?: string;
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

export type AppliedCouponSummary = {
  code: { id: string; code: string };
  campaign: { id: string; name: string };
  amountInCents: number;
  creditsGranted: number;
  discountAmountInCents: number;
  bonusCreditsGranted: number;
};

const CHECKOUT_REUSE_WINDOW_MINUTES = 15;

export function getPlanConfig(): Record<PlanId, PlanConfigEntry> {
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

// Quantas análises uma compra aprovada adiciona (mesma regra da ativação, usada
// também pela recuperação de confirmações de compra — uma única fonte).
export function resolveAnalysisCreditsForPlan(
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

@Injectable()
export class PlansService implements OnModuleInit {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(BusinessFunnelEventService)
    private readonly businessFunnelEventService: BusinessFunnelEventService,
    @Optional()
    @Inject(Ga4MeasurementService)
    private readonly ga4MeasurementService?: Ga4MeasurementService,
    @Optional()
    @Inject(CouponResolutionService)
    private readonly couponResolutionService?: CouponResolutionService,
    @Optional()
    @Inject(CvAdaptationService)
    private readonly cvAdaptationService?: CvAdaptationService,
    // Confirmação de compra por e-mail — só enfileira (dentro da transação
    // de aprovação, protegido por SAVEPOINT); nunca envia nem bloqueia os
    // créditos. Opcional: ausente em construções antigas/testes.
    @Optional()
    @Inject(EmailDispatchService)
    private readonly emailDispatch?: Pick<
      EmailDispatchService,
      "enqueuePurchaseConfirmationInTransaction"
    >,
  ) {}

  // Observável: sem esta dependência (fiação quebrada) a confirmação de compra
  // ficaria desligada em SILÊNCIO. O token abaixo é o que se procura no log
  // do deploy. (Specs que constroem o serviço à mão não passam por aqui.)
  onModuleInit() {
    if (!this.emailDispatch) {
      this.logger.warn(
        "email_dispatch_dependency_missing consumer=PlansService effect=purchase_confirmations_disabled",
      );
    }
  }

  // Fire-and-forget, fora da transação — mesmo padrão já usado pelo
  // resgate por crédito (CvAdaptationService.redeemWithCredit): a
  // geração/entrega do CV nunca deve prender a resposta do webhook nem a
  // transação de crédito.
  private triggerAdaptationDelivery(adaptationId: string): void {
    this.cvAdaptationService?.deliverAdaptation(adaptationId).catch((err) => {
      this.logger.error(
        `[auto-unlock] delivery failed for ${adaptationId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

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
    const brickDecision = this.evaluateBrickCheckoutEligibility();

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
          ? brickDecision.useBrick
            ? `${frontendUrl}/pagamento/checkout/${p.id}`
            : `${frontendUrl}/pagamento/pendente?checkoutId=${p.id}&resume=1`
          : null,
    }));
  }

  async createCheckout(
    userId: string,
    planId: PlanId,
    adaptationId?: string,
    selectedMissingKeywords: string[] = [],
    _gaClientId?: string,
    couponCode?: string,
  ): Promise<{
    checkoutUrl: string | null;
    purchaseId: string | null;
    checkoutMode?: "brick" | "free_coupon_confirmation_required";
    amountInCents?: number;
    creditsGranted?: number;
    appliedCoupon?: AppliedCouponSummary | null;
  }> {
    const plan = getPlanConfig()[planId];
    const payer = await this.resolveMercadoPagoPayer(userId);

    if (adaptationId) {
      await this.assertAdaptationCanBeAutoUnlocked(userId, adaptationId);
      await this.persistSelectedMissingKeywordsOnAdaptation(
        userId,
        adaptationId,
        selectedMissingKeywords,
      );
    }

    // Resolvido de novo aqui, server-side, mesmo que o preview (endpoint
    // /plans/coupon/preview) já tenha validado antes — nunca confia no
    // preview como fonte de verdade do valor cobrado. Cupom inválido nunca
    // bloqueia o checkout: só não é aplicado, e a resposta reflete isso em
    // `appliedCoupon: null` para o frontend nunca trocar de preço em
    // silêncio.
    const couponResolution = couponCode
      ? await this.couponResolutionService?.resolveForCheckout(
          couponCode,
          planId,
          plan.amountInCents,
          plan.downloadCreditsGranted,
        )
      : undefined;

    const appliedCoupon = this.toAppliedCouponSummary(couponResolution);

    const finalAmountInCents = appliedCoupon
      ? appliedCoupon.amountInCents
      : plan.amountInCents;
    const finalCreditsGranted = appliedCoupon
      ? appliedCoupon.creditsGranted
      : plan.downloadCreditsGranted;

    if (appliedCoupon && finalAmountInCents === 0) {
      // Desconto de 100%: não escreve nada aqui — só mostra o resumo.
      // O resgate real (atômico, com limite total/por usuário) só acontece
      // quando o usuário confirma explicitamente via
      // redeemFreeCoupon/POST /plans/checkout/redeem-free-coupon.
      return {
        checkoutUrl: null,
        purchaseId: null,
        checkoutMode: "free_coupon_confirmation_required",
        amountInCents: 0,
        creditsGranted: finalCreditsGranted,
        appliedCoupon,
      };
    }

    const effectivePlan: PlanConfigEntry = {
      ...plan,
      amountInCents: finalAmountInCents,
      downloadCreditsGranted: finalCreditsGranted,
    };

    const recentThreshold = new Date(
      Date.now() - CHECKOUT_REUSE_WINDOW_MINUTES * 60 * 1000,
    );

    // Reuso só é seguro quando a oferta é idêntica ao snapshot já
    // persistido na linha (mesmo cupom OU nenhum cupom nos dois lados, e
    // mesmo valor/créditos finais) — nunca muta uma compra existente para
    // representar uma oferta diferente (ver plano, seção 3). Qualquer
    // divergência cai para a criação de uma compra nova.
    const existing = await this.database.planPurchase.findFirst({
      where: {
        userId,
        planType: planId as UserPlanType,
        status: { in: ["none", "pending"] },
        createdAt: { gte: recentThreshold },
        originAction: adaptationId ? "unlock_cv" : "buy_credits",
        originAdaptationId: adaptationId ?? null,
        affiliateCodeId: appliedCoupon?.code.id ?? null,
      },
      orderBy: { createdAt: "desc" },
    });

    const reusable =
      existing &&
      existing.amountInCents === finalAmountInCents &&
      existing.creditsGranted === finalCreditsGranted;

    if (reusable && existing) {
      this.logger.log(
        `[checkout] reusing existing purchase ${existing.id} for user ${userId}`,
      );

      const brickDecision = this.evaluateBrickCheckoutEligibility();
      this.logger.log(
        `[checkout] mode_decision purchase=${existing.id} user=${userId} useBrick=${String(brickDecision.useBrick)} reason=${brickDecision.reason}`,
      );

      if (brickDecision.useBrick) {
        const lockUpdate = await this.database.planPurchase.updateMany({
          where: { id: existing.id, userId, status: "none" },
          data: { status: "pending" },
        });
        if (lockUpdate.count !== 1 && existing.status !== "pending") {
          throw new NotFoundException("Compra nao encontrada.");
        }
        return {
          checkoutUrl: this.buildBrickCheckoutUrl(existing.id),
          purchaseId: existing.id,
          checkoutMode: "brick",
          amountInCents: finalAmountInCents,
          creditsGranted: finalCreditsGranted,
          appliedCoupon,
        };
      }

      const checkoutUrl = await this.createMercadoPagoPreference(
        existing.id,
        existing.paymentReference,
        effectivePlan,
        payer,
        adaptationId,
      );
      return {
        checkoutUrl,
        purchaseId: existing.id,
        amountInCents: finalAmountInCents,
        creditsGranted: finalCreditsGranted,
        appliedCoupon,
      };
    }

    const paymentReference = randomUUID();

    const purchase = await this.database.planPurchase.create({
      data: {
        userId,
        planType: planId as UserPlanType,
        amountInCents: finalAmountInCents,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        creditsGranted: finalCreditsGranted,
        analysisCreditsGranted: plan.analysisCreditsGranted,
        originAction: adaptationId ? "unlock_cv" : "buy_credits",
        originAdaptationId: adaptationId ?? null,
        affiliateCodeId: appliedCoupon?.code.id ?? null,
        affiliateCampaignId: appliedCoupon?.campaign.id ?? null,
        couponDiscountAmountInCents: appliedCoupon?.discountAmountInCents ?? 0,
        couponBonusCreditsGranted: appliedCoupon?.bonusCreditsGranted ?? 0,
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
        amountInCents: finalAmountInCents,
        creditsGranted: finalCreditsGranted,
        appliedCoupon,
      };
    }

    const checkoutUrl = await this.createMercadoPagoPreference(
      purchase.id,
      paymentReference,
      effectivePlan,
      payer,
      adaptationId,
    );

    return {
      checkoutUrl,
      purchaseId: purchase.id,
      amountInCents: finalAmountInCents,
      creditsGranted: finalCreditsGranted,
      appliedCoupon,
    };
  }

  private toAppliedCouponSummary(
    resolution: CouponCheckoutResult | undefined,
  ): AppliedCouponSummary | null {
    if (!resolution?.valid) {
      return null;
    }
    return {
      code: { id: resolution.code.id, code: resolution.code.code },
      campaign: { id: resolution.campaign.id, name: resolution.campaign.name },
      amountInCents: resolution.amountInCents,
      creditsGranted: resolution.creditsGranted,
      discountAmountInCents: resolution.discountAmountInCents,
      bonusCreditsGranted: resolution.bonusCreditsGranted,
    };
  }

  // Usado pelo checkout Brick (PaymentsService) para aplicar/trocar cupom
  // numa compra pendente já criada — mesma resolução server-side de
  // createCheckout/previewCoupon, nunca confia em valor calculado no
  // frontend.
  async resolveCouponForCheckout(
    planId: PlanId,
    couponCode: string,
  ): Promise<AppliedCouponSummary | null> {
    const plan = getPlanConfig()[planId];
    const resolution = await this.couponResolutionService?.resolveForCheckout(
      couponCode,
      planId,
      plan.amountInCents,
      plan.downloadCreditsGranted,
    );
    return this.toAppliedCouponSummary(resolution);
  }

  async previewCoupon(
    couponCode: string,
    planId: PlanId,
  ): Promise<{
    valid: boolean;
    discountAmountInCents?: number;
    bonusCreditsGranted?: number;
    reason?: string;
  }> {
    const plan = getPlanConfig()[planId];
    const resolution = await this.couponResolutionService?.resolveForCheckout(
      couponCode,
      planId,
      plan.amountInCents,
      plan.downloadCreditsGranted,
    );

    if (!resolution?.valid) {
      return { valid: false, reason: resolution?.reason };
    }

    return {
      valid: true,
      discountAmountInCents: resolution.discountAmountInCents,
      bonusCreditsGranted: resolution.bonusCreditsGranted,
    };
  }

  // Evento de chegada ao link do criador (?ref=<code>) — requisito do
  // piloto para medir visitas por criador (ver seção 6 do plano). Só
  // registra se o código/campanha existir e estiver vigente
  // (resolveForAcquisition, sem exigir plano). Deduplicado por
  // visitor_id+código+dia via idempotencyKey — evita inflar o número com
  // reloads/voltas do mesmo visitante no mesmo dia.
  async trackCouponVisit(
    couponCode: string,
    visitorId: string | null,
  ): Promise<{ tracked: boolean }> {
    const acquisition =
      await this.couponResolutionService?.resolveForAcquisition(couponCode);
    if (!acquisition?.valid) {
      return { tracked: false };
    }

    const day = new Date().toISOString().slice(0, 10);
    const visitorKey = visitorId?.trim() || "unknown";

    const context: AnalysisRequestContext = {
      correlationId: `coupon-visit:${acquisition.code.id}:${visitorKey}:${day}`,
      ip: null,
      requestId: `coupon-visit:${acquisition.code.id}:${visitorKey}:${day}`,
      routePath: "/api/plans/coupon/visit",
      sessionInternalId: null,
      sessionPublicToken: null,
      userAgentHash: null,
      userId: null,
    };

    const result = await this.businessFunnelEventService.record(
      {
        eventName: "coupon_link_visited",
        eventVersion: 1,
        idempotencyKey: `coupon_visit:${visitorKey}:${acquisition.code.id}:${day}`,
        metadata: {
          affiliateCodeId: acquisition.code.id,
          affiliateCampaignId: acquisition.campaign.id,
          couponCode: acquisition.code.code,
          visitorId: visitorId ?? null,
        },
        routeKey: "api/plans/coupon/visit",
      },
      context,
      "backend",
    );

    return { tracked: result.ingested };
  }

  // Confirmação explícita de resgate de cupom com preço final zero.
  // createCheckout nunca chega até aqui sozinho — só este endpoint
  // consome o teto total/por usuário, sempre numa única transação atômica
  // que reaproveita a mesma trava condicional de applyApprovedPurchaseInsideTransaction
  // (nunca uma segunda implementação de "credita uma vez").
  async redeemFreeCoupon(
    userId: string,
    planId: PlanId,
    couponCode: string,
  ): Promise<{ purchaseId: string; creditsGranted: number }> {
    const plan = getPlanConfig()[planId];
    const resolution = await this.couponResolutionService?.resolveForCheckout(
      couponCode,
      planId,
      plan.amountInCents,
      plan.downloadCreditsGranted,
    );

    if (!resolution?.valid) {
      throw new BadRequestException("Cupom invalido para resgate gratuito.");
    }
    if (resolution.amountInCents !== 0) {
      throw new BadRequestException("Este cupom nao zera o preco do plano.");
    }
    if (resolution.campaign.freeRedemptionLimitTotal == null) {
      throw new BadRequestException(
        "Campanha sem limite de resgates configurado.",
      );
    }

    const paymentReference = randomUUID();
    const campaign = resolution.campaign;
    const code = resolution.code;

    type RedeemOutcome =
      | { outcome: "redeemed"; purchaseId: string }
      | { outcome: "campaign_limit_reached" }
      | { outcome: "already_redeemed" };

    const result: RedeemOutcome = await this.database
      .$transaction(async (tx): Promise<RedeemOutcome> => {
        const campaignLock = await tx.affiliateCampaign.updateMany({
          where: {
            id: campaign.id,
            freeRedemptionsUsed: { lt: campaign.freeRedemptionLimitTotal! },
          },
          data: { freeRedemptionsUsed: { increment: 1 } },
        });
        if (campaignLock.count !== 1) {
          return { outcome: "campaign_limit_reached" };
        }

        const purchase = await tx.planPurchase.create({
          data: {
            userId,
            planType: planId as UserPlanType,
            amountInCents: 0,
            currency: "BRL",
            paymentProvider: "internal_coupon",
            paymentReference,
            status: "none",
            creditsGranted: resolution.creditsGranted,
            analysisCreditsGranted: plan.analysisCreditsGranted,
            originAction: "buy_credits",
            affiliateCodeId: code.id,
            affiliateCampaignId: campaign.id,
            couponDiscountAmountInCents: resolution.discountAmountInCents,
            couponBonusCreditsGranted: resolution.bonusCreditsGranted,
          },
        });

        // A unicidade [affiliateCampaignId, userId] garante atomicamente o
        // limite de 1 resgate por usuário — se já existe, o create abaixo
        // lança e o Prisma reverte a transação inteira (incluindo o
        // incremento do teto total acima).
        await tx.affiliateFreeRedemption.create({
          data: {
            affiliateCampaignId: campaign.id,
            userId,
            planPurchaseId: purchase.id,
          },
        });

        const { applied } = await this.applyApprovedPurchaseInsideTransaction(
          tx,
          {
            id: purchase.id,
            userId,
            planType: planId as UserPlanType,
            paymentReference,
            status: "none",
            creditsGranted: resolution.creditsGranted,
            analysisCreditsGranted: plan.analysisCreditsGranted,
            originAction: "buy_credits",
            originAdaptationId: null,
            mpPaymentId: null,
            mpMerchantOrderId: null,
            mpPreferenceId: null,
          },
          undefined,
          { skipPaidAt: true },
        );

        if (!applied) {
          // Não deveria acontecer (a linha acabou de ser criada "none"),
          // mas se acontecer não deixa a transação seguir como sucesso.
          throw new Error("free_coupon_transition_failed");
        }

        return { outcome: "redeemed", purchaseId: purchase.id };
      })
      .catch((err): RedeemOutcome => {
        const isUniqueViolation =
          err instanceof Error &&
          "code" in err &&
          (err as { code?: string }).code === "P2002";
        if (isUniqueViolation) {
          return { outcome: "already_redeemed" };
        }
        throw err;
      });

    if (result.outcome === "campaign_limit_reached") {
      throw new ConflictException("Limite de resgates gratuitos esgotado.");
    }
    if (result.outcome === "already_redeemed") {
      throw new ConflictException("Cupom ja resgatado por este usuario.");
    }

    const purchaseId = result.purchaseId;

    this.logAuditEvent({
      eventType: "coupon_full_discount_granted",
      actionTaken: "redeemed",
      externalReference: paymentReference,
      internalCheckoutId: purchaseId,
      internalCheckoutType: "plan",
    });

    return { purchaseId, creditsGranted: resolution.creditsGranted };
  }

  async resumeCheckout(
    userId: string,
    purchaseId: string,
  ): Promise<{ checkoutUrl: string }> {
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

    const brickDecision = this.evaluateBrickCheckoutEligibility();
    if (brickDecision.useBrick) {
      this.logger.log(
        `[checkout:resume] purchase=${purchase.id} user=${userId} status=${purchase.status} useBrick=true reason=${brickDecision.reason}`,
      );
      return { checkoutUrl: this.buildBrickCheckoutUrl(purchase.id) };
    }

    const payer = await this.resolveMercadoPagoPayer(userId);

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
      `[checkout:resume] purchase=${purchase.id} user=${userId} status=${purchase.status} useBrick=false reason=${brickDecision.reason}`,
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
            paymentMethod: resolution.paymentMethod,
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

    if (resolution.status === "refunded") {
      await this.handleRefundedPayment(purchase, auditBase);
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

    // Confere o valor e a moeda efetivamente pagos (retornados pela API do
    // MP) contra o pedido persistido antes de creditar — bater só o
    // external_reference não garante que o valor certo foi pago.
    if (
      resolution.paidAmountInCents != null &&
      (resolution.paidAmountInCents !== purchase.amountInCents ||
        (resolution.paidCurrency &&
          resolution.paidCurrency !== purchase.currency))
    ) {
      this.logger.error(
        `[webhook:plans] amount/currency mismatch — purchase ${purchase.id} expected=${purchase.amountInCents}${purchase.currency} paid=${resolution.paidAmountInCents}${resolution.paidCurrency ?? "-"}`,
      );
      this.logAuditEvent({
        ...auditBase,
        eventType: "payment_amount_mismatch",
        actionTaken: "ignored",
        internalCheckoutId: purchase.id,
        errorMessage: `expected=${purchase.amountInCents}${purchase.currency} paid=${resolution.paidAmountInCents}${resolution.paidCurrency ?? "-"}`,
      });
      return;
    }

    // Atomic: re-check inside transaction to prevent double-credit on concurrent webhooks
    let purchaseApproved = false;
    let unlockedAdaptationId: string | null = null;

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

      const result = await this.applyApprovedPurchaseInsideTransaction(
        tx,
        current,
        {
          mpMerchantOrderId: resolution.merchantOrderId,
          mpPaymentId: resolution.paymentId,
          mpPreferenceId: resolution.preferenceId,
        },
      );
      purchaseApproved = result.applied;
      unlockedAdaptationId = result.unlockedAdaptationId;
    });

    if (unlockedAdaptationId) {
      this.triggerAdaptationDelivery(unlockedAdaptationId);
    }

    if (purchaseApproved) {
      await this.recordPaymentApprovedBusinessEvent({
        purchase,
        paymentId: resolution.paymentId,
        paymentReference: resolution.paymentReference,
        checkoutMode:
          purchase.mpPreferenceId || resolution.preferenceId
            ? "checkout_pro"
            : "brick",
        correlationId: `plans-webhook:${purchase.id}`,
        requestId: `plans-webhook:${purchase.id}`,
        routePath: "/api/plans/webhook/mercadopago",
        routeKey: "api/plans/webhook/mercadopago",
      });
    }

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

  // Webhook de refunded/charged_back. Política operacional explícita para o
  // piloto (não é uma prova de origem por unidade — User.creditsRemaining é
  // um saldo agregado único, sem ledger por compra): reverte no máximo
  // min(creditsGranted, saldo atual), nunca deixa o saldo negativo, e
  // registra tanto o que foi retirado quanto o que ficou pendente de
  // recuperação para conferência manual. CVs já entregues (CvUnlock) nunca
  // são revogados automaticamente.
  private async handleRefundedPayment(
    purchase: WebhookPurchaseRecord | null,
    auditBase: Omit<AuditEntry, "eventType" | "actionTaken">,
  ): Promise<void> {
    if (!purchase) {
      this.logAuditEvent({
        ...auditBase,
        eventType: "webhook_received",
        actionTaken: "ignored",
        errorMessage: "purchase not found for refund",
      });
      return;
    }

    if (purchase.status !== "completed") {
      // Nunca chegou a completar (ou já foi revertida antes) — mesmo
      // tratamento do branch "failed", sem nenhuma ação de crédito.
      if (purchase.status !== "failed" && purchase.status !== "refunded") {
        await this.database.planPurchase.update({
          where: { id: purchase.id },
          data: { status: "failed" },
        });
      }
      this.logAuditEvent({
        ...auditBase,
        eventType: "payment_rejected",
        actionTaken: "failed",
        internalCheckoutId: purchase.id,
        errorMessage: "refund_before_completion",
      });
      return;
    }

    let shortfall = 0;
    let appliedAmount = 0;
    let reversed = false;

    await this.database.$transaction(async (tx) => {
      // Trava atômica: só reverte se ainda estiver "completed" no momento
      // do update — impede dois webhooks de refunded concorrentes de
      // reverter duas vezes.
      const transition = await tx.planPurchase.updateMany({
        where: { id: purchase.id, status: "completed" },
        data: { status: "refunded" },
      });
      if (transition.count !== 1) return;

      const user = await tx.user.findUnique({
        where: { id: purchase.userId },
        select: { creditsRemaining: true, analysisCreditsRemaining: true },
      });
      if (!user) return;

      appliedAmount = Math.min(purchase.creditsGranted, user.creditsRemaining);
      shortfall = purchase.creditsGranted - appliedAmount;
      const appliedAnalysis = Math.min(
        purchase.analysisCreditsGranted,
        user.analysisCreditsRemaining,
      );

      await tx.user.update({
        where: { id: purchase.userId },
        data: {
          creditsRemaining: { decrement: appliedAmount },
          analysisCreditsRemaining: { decrement: appliedAnalysis },
        },
      });

      await tx.planPurchase.update({
        where: { id: purchase.id },
        data: {
          creditReversalAppliedAmount: appliedAmount,
          creditReversalShortfall: shortfall,
        },
      });

      reversed = true;
    });

    if (!reversed) {
      this.logAuditEvent({
        ...auditBase,
        eventType: "webhook_duplicated",
        actionTaken: "duplicated",
        internalCheckoutId: purchase.id,
        errorMessage: "refund_already_processed",
      });
      return;
    }

    this.logger.log(
      `[webhook:plans] payment refunded — purchase ${purchase.id} appliedAmount=${appliedAmount} shortfall=${shortfall}`,
    );
    this.logAuditEvent({
      ...auditBase,
      eventType: "payment_refunded_reversed",
      actionTaken: "reversed",
      internalCheckoutId: purchase.id,
      errorMessage:
        shortfall > 0
          ? `appliedAmount=${appliedAmount} shortfall=${shortfall}`
          : null,
    });

    if (shortfall > 0) {
      this.logAuditEvent({
        ...auditBase,
        eventType: "refund_credit_shortfall",
        actionTaken: "flagged_for_review",
        internalCheckoutId: purchase.id,
        errorMessage: `appliedAmount=${appliedAmount} shortfall=${shortfall}`,
      });
    }
  }

  // Used by reconciliation: applies credit for an already-verified approved purchase
  async applyApprovedPurchase(purchaseId: string): Promise<boolean> {
    let unlockedAdaptationId: string | null = null;

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

      const result = await this.applyApprovedPurchaseInsideTransaction(
        tx,
        purchase,
      );
      unlockedAdaptationId = result.unlockedAdaptationId;

      return result.applied ? purchase : null;
    });

    if (unlockedAdaptationId) {
      this.triggerAdaptationDelivery(unlockedAdaptationId);
    }

    if (!appliedPurchase) {
      return false;
    }

    await this.recordPaymentApprovedBusinessEvent({
      purchase: appliedPurchase,
      paymentId: appliedPurchase.mpPaymentId,
      paymentReference: appliedPurchase.paymentReference,
      checkoutMode: appliedPurchase.mpPreferenceId ? "checkout_pro" : "brick",
      correlationId: `plans-approval:${appliedPurchase.id}`,
      requestId: `plans-approval:${appliedPurchase.id}`,
      routePath: "/api/plans/apply-approved",
      routeKey: "api/plans/apply-approved",
    });

    this.logAuditEvent({
      eventType: "reconciliation_approved",
      actionTaken: "approved",
      externalReference: appliedPurchase.paymentReference,
      internalCheckoutId: appliedPurchase.id,
      internalCheckoutType: "plan",
    });

    return true;
  }

  // Correlação barata (1 lookup indexado, não um join caro em runtime):
  // reaproveita a relação JobApplication.currentCvAdaptationId ->
  // JobApplication.jobId que já existe hoje (jobId só é preenchido quando
  // a candidatura nasceu de uma vaga do Radar — ver
  // job-applications.service.ts). Sem originAdaptationId, ou sem
  // candidatura correlacionada, "direct" — nunca inventado.
  private async resolveProductOriginFromAdaptation(
    originAdaptationId: string | null | undefined,
  ): Promise<ProductOrigin> {
    if (!originAdaptationId) return "direct";

    try {
      const application = await this.database.jobApplication.findFirst({
        where: { currentCvAdaptationId: originAdaptationId },
        select: { jobId: true },
      });

      if (!application) return "direct";
      return application.jobId ? "radar" : "analysis";
    } catch (error) {
      this.logger.warn(
        `[analytics] failed to resolve product_origin for adaptation ${originAdaptationId}: ${error}`,
      );
      return "unknown";
    }
  }

  private async recordPaymentApprovedBusinessEvent(
    input: ApprovedPaymentEventInput,
  ): Promise<void> {
    const paymentId = input.paymentId ?? input.purchase.mpPaymentId ?? null;
    const paymentReference =
      input.paymentReference ?? input.purchase.paymentReference;

    if (!input.purchase.id) return;

    const productOrigin = await this.resolveProductOriginFromAdaptation(
      input.purchase.originAdaptationId,
    );

    const metadata: Record<string, unknown> = {
      purchaseId: input.purchase.id,
      product_origin: productOrigin,
      paymentId,
      paymentProvider: "mercado_pago",
      paymentReference,
      externalReference: paymentReference,
      userId: input.purchase.userId,
      user_id: input.purchase.userId,
      sessionId: null,
      planId: input.purchase.planType,
      planName: planTypeToDisplayName(input.purchase.planType),
      credits: input.purchase.creditsGranted,
      amount: input.purchase.amountInCents ?? null,
      currency: input.purchase.currency ?? "BRL",
      originAction: input.purchase.originAction,
      originAdaptationId: input.purchase.originAdaptationId,
      checkoutMode:
        input.checkoutMode ??
        (input.purchase.mpPreferenceId ? "checkout_pro" : "brick"),
      approvedAt: new Date().toISOString(),
      requestId: input.requestId ?? null,
      correlationId: input.correlationId ?? null,
    };

    const context: AnalysisRequestContext = {
      correlationId:
        input.correlationId ?? `plans-approval:${input.purchase.id}`,
      ip: null,
      requestId: input.requestId ?? `plans-approval:${input.purchase.id}`,
      routePath: input.routePath ?? "/api/plans",
      sessionInternalId: null,
      sessionPublicToken: null,
      userAgentHash: null,
      userId: input.purchase.userId,
    };

    try {
      const result = await this.businessFunnelEventService.record(
        {
          eventName: "payment_approved",
          eventVersion: 1,
          idempotencyKey: `payment_approved:purchase:${input.purchase.id}`,
          metadata,
          routeKey: input.routeKey ?? "api/plans",
        },
        context,
        "backend",
      );

      if (!result.ingested) {
        return;
      }

      try {
        await this.ga4MeasurementService?.sendPurchaseEvent({
          purchaseId: input.purchase.id,
          userId: input.purchase.userId,
          value: (input.purchase.amountInCents ?? 0) / 100,
          currency: input.purchase.currency ?? "BRL",
          planId: input.purchase.planType,
          planName: planTypeToDisplayName(input.purchase.planType),
          credits: input.purchase.creditsGranted,
          originAction: input.purchase.originAction,
          paymentId,
          paymentReference,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[ga4] payment_approved purchase sync failed: ${message}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to record payment_approved funnel event: ${error}`,
      );
    }
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
      metadata.product_origin = await this.resolveProductOriginFromAdaptation(
        resolvedPurchase.originAdaptationId,
      );
    } else {
      metadata.product_origin = "unknown";
    }
    // Método real vindo do payload do Mercado Pago (payment_type_id) —
    // nunca inventado. Sem o dado, "unknown", nunca um valor fixo como
    // "pix" adivinhado.
    metadata.paymentMethod = resolution.paymentMethod ?? "unknown";

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
    options?: { skipPaidAt?: boolean },
  ): Promise<{ applied: boolean; unlockedAdaptationId: string | null }> {
    const analysisCredits = this.resolveAnalysisCreditsForActivation(
      purchase.planType,
      purchase.analysisCreditsGranted,
    );
    const isUnlimited = purchase.planType === "unlimited";
    const planExpiresAt = isUnlimited
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : null;

    // Trava atômica: a checagem de elegibilidade do chamador (leitura
    // separada antes desta transação) não é suficiente sob concorrência —
    // duas transações podem ler o mesmo status elegível antes de qualquer
    // uma commitar. A condição de status precisa estar na própria cláusula
    // WHERE do update (mesmo padrão de payments.service.ts:349-366,
    // submitBrickPayment) para garantir que só uma delas credita.
    const transition = await tx.planPurchase.updateMany({
      where: {
        id: purchase.id,
        status: {
          in: Array.from(APPROVED_PURCHASE_ELIGIBLE_STATUSES) as (
            | "none"
            | "pending"
            | "processing_payment"
            | "pending_payment"
          )[],
        },
      },
      data: {
        status: "completed",
        // Resgate de cupom com preço zero (internal_coupon) nunca finge que
        // houve pagamento: paidAt fica vazio, couponRedeemedAt marca a
        // conclusão do resgate (ver redeemFreeCoupon).
        ...(options?.skipPaidAt
          ? { couponRedeemedAt: new Date() }
          : { paidAt: new Date() }),
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

    if (transition.count !== 1) {
      // Outra transação concorrente já processou esta compra entre a
      // leitura do chamador e esta atualização — não credita de novo.
      return { applied: false, unlockedAdaptationId: null };
    }

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

    // Único ponto por onde TODO caminho de aprovação passa (webhook do
    // Mercado Pago, applyApprovedPurchase/reconciliação e resgate de cupom
    // 100%), logo depois de os créditos serem aplicados e dentro da mesma
    // transação — a trava atômica acima garante 1 execução por compra. Falha
    // do enqueue é absorvida por SAVEPOINT e nunca desfaz os créditos.
    await this.emailDispatch?.enqueuePurchaseConfirmationInTransaction(tx, {
      purchaseId: purchase.id,
      userId: purchase.userId,
      creditsApplied: purchase.creditsGranted,
      analysisCreditsApplied: analysisCredits,
      isUnlimited,
    });

    if (
      purchase.originAction !== "unlock_cv" ||
      !purchase.originAdaptationId ||
      isUnlimited
    ) {
      return { applied: true, unlockedAdaptationId: null };
    }

    if (purchase.creditsGranted <= 0) {
      await tx.planPurchase.update({
        where: { id: purchase.id },
        data: {
          autoUnlockError: "purchase has no credits to auto-unlock",
        },
      });
      return { applied: true, unlockedAdaptationId: null };
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
      return { applied: true, unlockedAdaptationId: null };
    }

    if (adaptation.userId !== purchase.userId) {
      await tx.planPurchase.update({
        where: { id: purchase.id },
        data: {
          autoUnlockError: "origin adaptation ownership mismatch",
        },
      });
      return { applied: true, unlockedAdaptationId: null };
    }

    if (adaptation.isUnlocked) {
      await tx.planPurchase.update({
        where: { id: purchase.id },
        data: {
          autoUnlockProcessedAt: new Date(),
          autoUnlockError: null,
        },
      });
      // Já estava desbloqueada antes desta compra (ex.: outro crédito) —
      // a entrega (deliverAdaptation) já rodou ou está em andamento em
      // outro fluxo; não dispara de novo aqui.
      return { applied: true, unlockedAdaptationId: null };
    }

    if (!adaptation.adaptedContentJson) {
      await tx.planPurchase.update({
        where: { id: purchase.id },
        data: {
          autoUnlockError: "origin adaptation has no adapted content",
        },
      });
      return { applied: true, unlockedAdaptationId: null };
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

    // Único branch onde a adaptação acabou de ser desbloqueada por esta
    // compra — o chamador (fora da transação) dispara a entrega
    // (deliverAdaptation, que gera o Resume final e marca "delivered").
    // Sem isso a tela /adaptacao-cv/:id fica presa no skeleton de geração
    // pra sempre: o auto-unlock via compra de plano nunca chamava
    // deliverAdaptation (só o fluxo de resgate por crédito chamava).
    return { applied: true, unlockedAdaptationId: adaptation.id };
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

  private async persistSelectedMissingKeywordsOnAdaptation(
    userId: string,
    adaptationId: string,
    selectedMissingKeywords: string[],
  ): Promise<void> {
    if (selectedMissingKeywords.length === 0) {
      return;
    }

    const adaptation = await this.database.cvAdaptation.findUnique({
      where: { id: adaptationId },
      select: {
        userId: true,
        adaptedContentJson: true,
      },
    });

    if (!adaptation || adaptation.userId !== userId) {
      throw new NotFoundException("adaptation not found");
    }

    if (
      !adaptation.adaptedContentJson ||
      typeof adaptation.adaptedContentJson !== "object"
    ) {
      return;
    }

    const sanitized = selectedMissingKeywords
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0)
      .slice(0, 80);

    if (sanitized.length === 0) {
      return;
    }

    await this.database.cvAdaptation.update({
      where: { id: adaptationId },
      data: {
        adaptedContentJson: {
          ...(adaptation.adaptedContentJson as Record<string, unknown>),
          selectedMissingKeywords: sanitized,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private resolveAnalysisCreditsForActivation(
    planType: UserPlanType,
    analysisCreditsGranted: number,
  ): number {
    return resolveAnalysisCreditsForPlan(planType, analysisCreditsGranted);
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
      paymentMethod: null,
      paidAmountInCents: null,
      paidCurrency: null,
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
      payment_type_id?: string;
      transaction_amount?: number;
      currency_id?: string;
    };
    const paymentMethod =
      typeof mp.payment_type_id === "string" && mp.payment_type_id.trim()
        ? mp.payment_type_id.trim()
        : null;
    const paidAmountInCents =
      typeof mp.transaction_amount === "number"
        ? Math.round(mp.transaction_amount * 100)
        : null;
    const paidCurrency =
      typeof mp.currency_id === "string" && mp.currency_id.trim()
        ? mp.currency_id.trim()
        : null;

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
        paymentMethod,
        paidAmountInCents,
        paidCurrency,
      };
    }

    // refunded/charged_back são distintos de rejected/cancelled: só os
    // primeiros representam "foi pago e depois estornado", exigindo
    // reversão de crédito (ver branch dedicado em handleWebhook). Colapsar
    // os dois em "failed" (comportamento anterior) escondia essa diferença.
    if (payment.status === "refunded" || payment.status === "charged_back") {
      return {
        paymentReference,
        purchaseId: metadataPurchaseId,
        externalReference,
        status: "refunded",
        paymentId,
        merchantOrderId,
        preferenceId,
        rawStatus,
        statusDetail,
        paymentMethod,
        paidAmountInCents,
        paidCurrency,
      };
    }

    if (payment.status === "cancelled" || payment.status === "rejected") {
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
        paymentMethod,
        paidAmountInCents,
        paidCurrency,
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
      paymentMethod,
      paidAmountInCents,
      paidCurrency,
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
      if (Number.isNaN(value)) {
        throw new Error(
          `Env var ${name} must be a valid integer, got: "${raw}"`,
        );
      }
      return value;
    }
  }
  throw new Error(`Required env var(s) [${names.join(", ")}] are not set`);
}
