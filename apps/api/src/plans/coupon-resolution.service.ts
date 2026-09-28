import { Inject, Injectable } from "@nestjs/common";
import type { AffiliateCampaign, AffiliateCode } from "@prisma/client";

import { DatabaseService } from "../database/database.service";

export type CouponInvalidReason =
  | "missing_code"
  | "code_not_found"
  | "code_inactive"
  | "campaign_inactive"
  | "campaign_not_started"
  | "campaign_ended"
  | "plan_not_eligible"
  | "free_redemption_not_configured";

export type CouponAcquisitionResult =
  | { valid: true; code: AffiliateCode; campaign: AffiliateCampaign }
  | { valid: false; reason: CouponInvalidReason };

export type CouponCheckoutResult =
  | {
      valid: true;
      code: AffiliateCode;
      campaign: AffiliateCampaign;
      amountInCents: number;
      creditsGranted: number;
      discountAmountInCents: number;
      bonusCreditsGranted: number;
    }
  | { valid: false; reason: CouponInvalidReason };

/**
 * Resolução de cupom dividida em duas responsabilidades:
 * - `resolveForAcquisition`: só valida se o código/campanha existe e está
 *   vigente (status + datas). Não exige plano — usado na captura de
 *   first-touch, no cadastro, e na contagem de visitas, onde ainda não
 *   existe nenhuma oferta escolhida.
 * - `resolveForCheckout`: reaproveita `resolveForAcquisition` e adiciona a
 *   checagem de plano elegível + o cálculo de preço/créditos finais. Só
 *   usado no preview e no checkout, onde o plano já é conhecido.
 */
@Injectable()
export class CouponResolutionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async resolveForAcquisition(
    rawCode: string | null | undefined,
  ): Promise<CouponAcquisitionResult> {
    // Cupom é case-insensitive: sempre resolvido em maiúsculas, o mesmo
    // formato em que admin-affiliates.service.ts grava o código.
    const code = rawCode?.trim().toUpperCase();
    if (!code) {
      return { valid: false, reason: "missing_code" };
    }

    const record = await this.database.affiliateCode.findUnique({
      where: { code },
      include: { campaign: true },
    });

    if (!record) {
      return { valid: false, reason: "code_not_found" };
    }
    if (record.status !== "active") {
      return { valid: false, reason: "code_inactive" };
    }
    if (record.campaign.status !== "active") {
      return { valid: false, reason: "campaign_inactive" };
    }

    const now = new Date();
    if (record.campaign.startsAt && now < record.campaign.startsAt) {
      return { valid: false, reason: "campaign_not_started" };
    }
    if (record.campaign.endsAt && now > record.campaign.endsAt) {
      return { valid: false, reason: "campaign_ended" };
    }

    const { campaign, ...codeOnly } = record;
    return { valid: true, code: codeOnly as AffiliateCode, campaign };
  }

  async resolveForCheckout(
    rawCode: string | null | undefined,
    planId: string,
    baseAmountInCents: number,
    baseDownloadCreditsGranted: number,
  ): Promise<CouponCheckoutResult> {
    const acquisition = await this.resolveForAcquisition(rawCode);
    if (!acquisition.valid) {
      return acquisition;
    }

    const { code, campaign } = acquisition;

    if (!campaign.eligiblePlanIds.includes(planId)) {
      return { valid: false, reason: "plan_not_eligible" };
    }

    const discountAmountInCents = this.computeDiscountAmountInCents(
      campaign,
      baseAmountInCents,
    );
    const amountInCents = Math.max(
      0,
      baseAmountInCents - discountAmountInCents,
    );

    const bonusCreditsGranted = this.computeBonusCredits(
      campaign,
      baseDownloadCreditsGranted,
    );
    const creditsGranted = baseDownloadCreditsGranted + bonusCreditsGranted;

    // Rede de segurança: uma campanha só pode zerar o preço se tiver um
    // teto total de resgates configurado (obrigatório também no admin, ver
    // etapa 7) — nunca depende só da validação da UI.
    if (amountInCents === 0 && campaign.freeRedemptionLimitTotal == null) {
      return { valid: false, reason: "free_redemption_not_configured" };
    }

    return {
      valid: true,
      code,
      campaign,
      amountInCents,
      creditsGranted,
      discountAmountInCents,
      bonusCreditsGranted,
    };
  }

  private computeDiscountAmountInCents(
    campaign: AffiliateCampaign,
    baseAmountInCents: number,
  ): number {
    if (!campaign.defaultDiscountType || !campaign.defaultDiscountValue) {
      return 0;
    }

    const raw =
      campaign.defaultDiscountType === "percentage"
        ? Math.round((baseAmountInCents * campaign.defaultDiscountValue) / 100)
        : campaign.defaultDiscountValue;

    return Math.min(Math.max(raw, 0), baseAmountInCents);
  }

  private computeBonusCredits(
    campaign: AffiliateCampaign,
    baseDownloadCreditsGranted: number,
  ): number {
    if (!campaign.creditBonusType || !campaign.creditBonusValue) {
      return 0;
    }

    if (campaign.creditBonusType === "multiplier") {
      return Math.max(
        0,
        baseDownloadCreditsGranted * campaign.creditBonusValue -
          baseDownloadCreditsGranted,
      );
    }

    return Math.max(0, campaign.creditBonusValue);
  }
}
