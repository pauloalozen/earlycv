-- CreateEnum
CREATE TYPE "AffiliateCreditBonusType" AS ENUM ('multiplier', 'fixed_extra');

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'internal_coupon';

-- AlterTable
ALTER TABLE "AffiliateCampaign" ADD COLUMN     "creditBonusType" "AffiliateCreditBonusType",
ADD COLUMN     "creditBonusValue" INTEGER,
ADD COLUMN     "eligiblePlanIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "freeRedemptionLimitTotal" INTEGER,
ADD COLUMN     "freeRedemptionPerUserLimit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "freeRedemptionsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "partnershipCostInCents" INTEGER,
ADD COLUMN     "startsAt" TIMESTAMP(3),
ALTER COLUMN "defaultCommissionType" DROP NOT NULL,
ALTER COLUMN "defaultCommissionValue" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PlanPurchase" ADD COLUMN     "affiliateCampaignId" TEXT,
ADD COLUMN     "affiliateCodeId" TEXT,
ADD COLUMN     "couponBonusCreditsGranted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "couponDiscountAmountInCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "couponRedeemedAt" TIMESTAMP(3),
ADD COLUMN     "creditReversalAppliedAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "creditReversalShortfall" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "signupAffiliateCodeId" TEXT;

-- CreateTable
CREATE TABLE "AffiliateFreeRedemption" (
    "id" TEXT NOT NULL,
    "affiliateCampaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planPurchaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateFreeRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateFreeRedemption_planPurchaseId_key" ON "AffiliateFreeRedemption"("planPurchaseId");

-- CreateIndex
CREATE INDEX "AffiliateFreeRedemption_userId_idx" ON "AffiliateFreeRedemption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateFreeRedemption_affiliateCampaignId_userId_key" ON "AffiliateFreeRedemption"("affiliateCampaignId", "userId");

-- CreateIndex
CREATE INDEX "PlanPurchase_affiliateCodeId_idx" ON "PlanPurchase"("affiliateCodeId");

-- CreateIndex
CREATE INDEX "PlanPurchase_affiliateCampaignId_idx" ON "PlanPurchase"("affiliateCampaignId");

-- CreateIndex
CREATE INDEX "User_signupAffiliateCodeId_idx" ON "User"("signupAffiliateCodeId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_signupAffiliateCodeId_fkey" FOREIGN KEY ("signupAffiliateCodeId") REFERENCES "AffiliateCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPurchase" ADD CONSTRAINT "PlanPurchase_affiliateCodeId_fkey" FOREIGN KEY ("affiliateCodeId") REFERENCES "AffiliateCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPurchase" ADD CONSTRAINT "PlanPurchase_affiliateCampaignId_fkey" FOREIGN KEY ("affiliateCampaignId") REFERENCES "AffiliateCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateFreeRedemption" ADD CONSTRAINT "AffiliateFreeRedemption_affiliateCampaignId_fkey" FOREIGN KEY ("affiliateCampaignId") REFERENCES "AffiliateCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateFreeRedemption" ADD CONSTRAINT "AffiliateFreeRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateFreeRedemption" ADD CONSTRAINT "AffiliateFreeRedemption_planPurchaseId_fkey" FOREIGN KEY ("planPurchaseId") REFERENCES "PlanPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
