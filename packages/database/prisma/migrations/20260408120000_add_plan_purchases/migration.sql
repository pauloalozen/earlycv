-- AlterEnum
ALTER TYPE "UserPlanType" ADD VALUE 'starter';
ALTER TYPE "UserPlanType" ADD VALUE 'pro';
ALTER TYPE "UserPlanType" ADD VALUE 'unlimited';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "creditsRemaining" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "planActivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "planExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlanPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planType" "UserPlanType" NOT NULL,
    "amountInCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "paymentProvider" "PaymentProvider" NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'none',
    "paidAt" TIMESTAMP(3),
    "creditsGranted" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanPurchase_paymentReference_key" ON "PlanPurchase"("paymentReference");

-- CreateIndex
CREATE INDEX "PlanPurchase_userId_createdAt_idx" ON "PlanPurchase"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanPurchase_paymentReference_idx" ON "PlanPurchase"("paymentReference");

-- AddForeignKey
ALTER TABLE "PlanPurchase" ADD CONSTRAINT "PlanPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
