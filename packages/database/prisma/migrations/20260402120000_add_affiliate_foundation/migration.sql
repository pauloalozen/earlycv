-- CreateEnum
CREATE TYPE "AffiliatePartnerStatus" AS ENUM ('draft', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "AffiliateCampaignStatus" AS ENUM ('draft', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "AffiliateCodeStatus" AS ENUM ('draft', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "AffiliateRewardType" AS ENUM ('percentage', 'fixed_amount');

-- CreateEnum
CREATE TYPE "AffiliateCommissionStatus" AS ENUM ('pending', 'approved', 'paid', 'reversed');

-- CreateTable
CREATE TABLE "AffiliatePartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT,
    "status" "AffiliatePartnerStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliatePartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCampaign" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attributionWindowDays" INTEGER NOT NULL DEFAULT 30,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'BRL',
    "defaultDiscountType" "AffiliateRewardType",
    "defaultDiscountValue" INTEGER,
    "defaultCommissionType" "AffiliateRewardType" NOT NULL,
    "defaultCommissionValue" INTEGER NOT NULL,
    "status" "AffiliateCampaignStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCode" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "landingPageUrl" TEXT,
    "status" "AffiliateCodeStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateAttribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "affiliateCampaignId" TEXT NOT NULL,
    "affiliateCodeId" TEXT NOT NULL,
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommissionEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "affiliateCampaignId" TEXT NOT NULL,
    "affiliateCodeId" TEXT NOT NULL,
    "affiliateAttributionId" TEXT,
    "purchaseReference" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "grossAmountInCents" INTEGER NOT NULL,
    "discountAmountInCents" INTEGER NOT NULL DEFAULT 0,
    "netAmountInCents" INTEGER NOT NULL,
    "commissionType" "AffiliateRewardType" NOT NULL,
    "commissionValue" INTEGER NOT NULL,
    "commissionAmountInCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" "AffiliateCommissionStatus" NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateCommissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePartner_slug_key" ON "AffiliatePartner"("slug");

-- CreateIndex
CREATE INDEX "AffiliateCampaign_partnerId_idx" ON "AffiliateCampaign"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCode_code_key" ON "AffiliateCode"("code");

-- CreateIndex
CREATE INDEX "AffiliateCode_campaignId_idx" ON "AffiliateCode"("campaignId");

-- CreateIndex
CREATE INDEX "AffiliateAttribution_affiliateCampaignId_idx" ON "AffiliateAttribution"("affiliateCampaignId");

-- CreateIndex
CREATE INDEX "AffiliateAttribution_affiliateCodeId_idx" ON "AffiliateAttribution"("affiliateCodeId");

-- CreateIndex
CREATE INDEX "AffiliateAttribution_userId_idx" ON "AffiliateAttribution"("userId");

-- CreateIndex
CREATE INDEX "AffiliateAttribution_expiresAt_idx" ON "AffiliateAttribution"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCommissionEvent_purchaseReference_key" ON "AffiliateCommissionEvent"("purchaseReference");

-- CreateIndex
CREATE INDEX "AffiliateCommissionEvent_userId_idx" ON "AffiliateCommissionEvent"("userId");

-- CreateIndex
CREATE INDEX "AffiliateCommissionEvent_affiliateCampaignId_idx" ON "AffiliateCommissionEvent"("affiliateCampaignId");

-- CreateIndex
CREATE INDEX "AffiliateCommissionEvent_affiliateCodeId_idx" ON "AffiliateCommissionEvent"("affiliateCodeId");

-- CreateIndex
CREATE INDEX "AffiliateCommissionEvent_status_idx" ON "AffiliateCommissionEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCode_id_campaignId_key" ON "AffiliateCode"("id", "campaignId");

-- AddForeignKey
ALTER TABLE "AffiliateCampaign" ADD CONSTRAINT "AffiliateCampaign_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCode" ADD CONSTRAINT "AffiliateCode_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AffiliateCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_affiliateCampaignId_fkey" FOREIGN KEY ("affiliateCampaignId") REFERENCES "AffiliateCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_affiliateCodeId_affiliateCampaignId_fkey" FOREIGN KEY ("affiliateCodeId", "affiliateCampaignId") REFERENCES "AffiliateCode"("id", "campaignId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommissionEvent" ADD CONSTRAINT "AffiliateCommissionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommissionEvent" ADD CONSTRAINT "AffiliateCommissionEvent_affiliateCampaignId_fkey" FOREIGN KEY ("affiliateCampaignId") REFERENCES "AffiliateCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommissionEvent" ADD CONSTRAINT "AffiliateCommissionEvent_affiliateCodeId_affiliateCampaign_fkey" FOREIGN KEY ("affiliateCodeId", "affiliateCampaignId") REFERENCES "AffiliateCode"("id", "campaignId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommissionEvent" ADD CONSTRAINT "AffiliateCommissionEvent_affiliateAttributionId_fkey" FOREIGN KEY ("affiliateAttributionId") REFERENCES "AffiliateAttribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
