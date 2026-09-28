import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { getPlanConfig, type PlanId } from "../plans/plans.service";
import type { UpsertAffiliateCampaignDto } from "./dto/upsert-affiliate-campaign.dto";
import type { UpsertAffiliateCodeDto } from "./dto/upsert-affiliate-code.dto";
import type { UpsertAffiliatePartnerDto } from "./dto/upsert-affiliate-partner.dto";

@Injectable()
export class AdminAffiliatesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  // --- Partners ---------------------------------------------------------

  listPartners() {
    return this.database.affiliatePartner.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        codes: {
          select: {
            id: true,
            code: true,
            status: true,
            campaign: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });
  }

  createPartner(dto: UpsertAffiliatePartnerDto) {
    return this.database.affiliatePartner.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        email: dto.email,
        status: dto.status ?? "draft",
      },
    });
  }

  async updatePartner(id: string, dto: UpsertAffiliatePartnerDto) {
    await this.assertPartnerExists(id);
    return this.database.affiliatePartner.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        email: dto.email,
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
  }

  async setPartnerStatus(id: string, status: "draft" | "active" | "inactive") {
    await this.assertPartnerExists(id);
    return this.database.affiliatePartner.update({
      where: { id },
      data: { status },
    });
  }

  private async assertPartnerExists(id: string) {
    const found = await this.database.affiliatePartner.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException("Parceiro nao encontrado.");
  }

  // --- Campaigns ----------------------------------------------------------

  private static readonly campaignInclude = {
    codes: {
      select: {
        id: true,
        code: true,
        status: true,
        partnerId: true,
        partner: { select: { id: true, name: true, slug: true } },
      },
    },
  } satisfies Prisma.AffiliateCampaignInclude;

  listCampaigns(partnerId?: string) {
    return this.database.affiliateCampaign.findMany({
      where: partnerId ? { codes: { some: { partnerId } } } : undefined,
      orderBy: { createdAt: "desc" },
      include: AdminAffiliatesService.campaignInclude,
    });
  }

  createCampaign(dto: UpsertAffiliateCampaignDto) {
    this.assertCampaignPayloadIsSafe(dto);
    return this.database.affiliateCampaign.create({
      data: this.buildCampaignData(dto),
      include: AdminAffiliatesService.campaignInclude,
    });
  }

  async updateCampaign(id: string, dto: UpsertAffiliateCampaignDto) {
    const existing = await this.database.affiliateCampaign.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Campanha nao encontrada.");
    this.assertCampaignPayloadIsSafe(dto);
    return this.database.affiliateCampaign.update({
      where: { id },
      data: this.buildCampaignData(dto),
      include: AdminAffiliatesService.campaignInclude,
    });
  }

  async setCampaignStatus(id: string, status: "draft" | "active" | "inactive") {
    const existing = await this.database.affiliateCampaign.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Campanha nao encontrada.");
    return this.database.affiliateCampaign.update({
      where: { id },
      data: { status },
      include: AdminAffiliatesService.campaignInclude,
    });
  }

  private buildCampaignData(
    dto: UpsertAffiliateCampaignDto,
  ): Prisma.AffiliateCampaignUncheckedCreateInput {
    return {
      name: dto.name,
      status: dto.status ?? "draft",
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      eligiblePlanIds: dto.eligiblePlanIds,
      defaultDiscountType: dto.defaultDiscountType ?? null,
      defaultDiscountValue: dto.defaultDiscountValue ?? null,
      creditBonusType: dto.creditBonusType ?? null,
      creditBonusValue: dto.creditBonusValue ?? null,
      partnershipCostInCents: dto.partnershipCostInCents ?? null,
      freeRedemptionPerUserLimit: dto.freeRedemptionPerUserLimit ?? 1,
      freeRedemptionLimitTotal: dto.freeRedemptionLimitTotal ?? null,
    };
  }

  // Bloqueia no admin o mesmo caso que o CouponResolutionService já
  // bloqueia em runtime (rede de segurança dupla, nunca confia só na UI):
  // campanha que pode zerar o preço de algum plano elegível precisa de um
  // teto total de resgates definido antes de ser criada/editada.
  private assertCampaignPayloadIsSafe(dto: UpsertAffiliateCampaignDto) {
    if (
      dto.defaultDiscountType === "percentage" &&
      (dto.defaultDiscountValue ?? 0) > 100
    ) {
      throw new BadRequestException(
        "Desconto percentual nao pode passar de 100%.",
      );
    }

    const canReachZero = this.canCampaignReachZeroPrice(dto);
    if (canReachZero && !dto.freeRedemptionLimitTotal) {
      throw new BadRequestException(
        "Campanhas que podem zerar o preco de algum plano exigem um limite total de resgates gratuitos.",
      );
    }
  }

  private canCampaignReachZeroPrice(dto: UpsertAffiliateCampaignDto): boolean {
    if (
      dto.defaultDiscountType !== "percentage" &&
      dto.defaultDiscountType !== "fixed_amount"
    ) {
      return false;
    }
    if (!dto.defaultDiscountValue) return false;

    const plans = getPlanConfig();
    return dto.eligiblePlanIds.some((planId) => {
      const plan = plans[planId as PlanId];
      if (!plan) return false;
      const discount =
        dto.defaultDiscountType === "percentage"
          ? Math.round(
              (plan.amountInCents * (dto.defaultDiscountValue ?? 0)) / 100,
            )
          : (dto.defaultDiscountValue ?? 0);
      return discount >= plan.amountInCents;
    });
  }

  // --- Codes ---------------------------------------------------------------

  createCode(dto: UpsertAffiliateCodeDto) {
    return this.database.affiliateCode.create({
      data: {
        campaignId: dto.campaignId,
        partnerId: dto.partnerId,
        code: dto.code.trim().toUpperCase(),
        landingPageUrl: dto.landingPageUrl,
        status: dto.status ?? "draft",
      },
      include: {
        partner: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async setCodeStatus(id: string, status: "draft" | "active" | "inactive") {
    const existing = await this.database.affiliateCode.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Codigo nao encontrado.");
    return this.database.affiliateCode.update({
      where: { id },
      data: { status },
      include: {
        partner: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  // --- Report ---------------------------------------------------------------

  // Métricas rotuladas por confiança (ver plano, seção 6): compras
  // aprovadas/receita são exatas (fonte: PlanPurchase.status atual, que a
  // reversão de estorno já sobrescreve — nunca conta compra revertida);
  // cadastros e visitas são best-effort (dependem de localStorage
  // sobreviver até o cadastro / consentimento de analytics).
  async getCampaignReport(campaignId: string) {
    const campaign = await this.database.affiliateCampaign.findUnique({
      where: { id: campaignId },
      include: { codes: { select: { id: true } } },
    });
    if (!campaign) throw new NotFoundException("Campanha nao encontrada.");

    const codeIds = campaign.codes.map((c) => c.id);

    const [purchases, signupsCount, visitEvents] = await Promise.all([
      this.database.planPurchase.findMany({
        where: { affiliateCampaignId: campaignId, status: "completed" },
        select: {
          amountInCents: true,
          couponDiscountAmountInCents: true,
          couponBonusCreditsGranted: true,
          creditsGranted: true,
          userId: true,
        },
      }),
      this.database.user.count({
        where: { signupAffiliateCodeId: { in: codeIds } },
      }),
      this.database.businessFunnelEvent.count({
        where: {
          eventName: "coupon_link_visited",
          metadataJson: {
            path: ["affiliateCampaignId"],
            equals: campaignId,
          },
        },
      }),
    ]);

    const approvedPurchaseCount = purchases.length;
    const uniqueBuyers = new Set(purchases.map((p) => p.userId)).size;
    const revenueInCents = purchases.reduce(
      (sum, p) => sum + p.amountInCents,
      0,
    );
    const discountGrantedInCents = purchases.reduce(
      (sum, p) => sum + p.couponDiscountAmountInCents,
      0,
    );
    const bonusCreditsGranted = purchases.reduce(
      (sum, p) => sum + p.couponBonusCreditsGranted,
      0,
    );

    const partnershipCostInCents = campaign.partnershipCostInCents ?? null;

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      metrics: {
        visits: {
          value: visitEvents,
          confidence: "best_effort" as const,
          note: "Visitas capturadas sob consentimento de analytics — visitantes que recusaram nao aparecem aqui.",
        },
        signups: {
          value: signupsCount,
          confidence: "best_effort" as const,
          note: "Depende do link sobreviver em localStorage ate o cadastro.",
        },
        approvedPurchases: {
          value: approvedPurchaseCount,
          confidence: "exact" as const,
        },
        uniqueBuyers: { value: uniqueBuyers, confidence: "exact" as const },
        revenueInCents: { value: revenueInCents, confidence: "exact" as const },
        discountGrantedInCents: {
          value: discountGrantedInCents,
          confidence: "exact" as const,
        },
        bonusCreditsGranted: {
          value: bonusCreditsGranted,
          confidence: "exact" as const,
        },
        freeRedemptionsUsed: {
          value: campaign.freeRedemptionsUsed,
          total: campaign.freeRedemptionLimitTotal,
          confidence: "exact" as const,
        },
        cacPerSignupInCents:
          partnershipCostInCents != null && signupsCount > 0
            ? {
                value: Math.round(partnershipCostInCents / signupsCount),
                confidence: "best_effort" as const,
              }
            : null,
        cacPerBuyerInCents:
          partnershipCostInCents != null && uniqueBuyers > 0
            ? {
                value: Math.round(partnershipCostInCents / uniqueBuyers),
                confidence: "best_effort" as const,
              }
            : null,
      },
    };
  }
}
