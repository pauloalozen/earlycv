-- CreateEnum
CREATE TYPE "PlanPurchaseOriginAction" AS ENUM ('buy_credits', 'unlock_cv');

-- AlterTable
ALTER TABLE "PlanPurchase"
ADD COLUMN "originAction" "PlanPurchaseOriginAction" NOT NULL DEFAULT 'buy_credits',
ADD COLUMN "originAdaptationId" TEXT,
ADD COLUMN "autoUnlockProcessedAt" TIMESTAMP(3),
ADD COLUMN "autoUnlockError" TEXT;

-- CreateIndex
CREATE INDEX "PlanPurchase_originAdaptationId_idx" ON "PlanPurchase"("originAdaptationId");
