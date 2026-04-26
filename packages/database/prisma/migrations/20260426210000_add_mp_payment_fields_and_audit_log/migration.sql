-- AlterTable
ALTER TABLE "CvAdaptation" ADD COLUMN     "mpMerchantOrderId" TEXT,
ADD COLUMN     "mpPaymentId" TEXT,
ADD COLUMN     "mpPreferenceId" TEXT;

-- AlterTable
ALTER TABLE "PlanPurchase" ADD COLUMN     "mpMerchantOrderId" TEXT,
ADD COLUMN     "mpPaymentId" TEXT,
ADD COLUMN     "mpPreferenceId" TEXT;

-- CreateTable
CREATE TABLE "PaymentAuditLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "mpPaymentId" TEXT,
    "mpMerchantOrderId" TEXT,
    "mpPreferenceId" TEXT,
    "externalReference" TEXT,
    "internalCheckoutId" TEXT,
    "internalCheckoutType" TEXT,
    "mpStatus" TEXT,
    "errorMessage" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentAuditLog_mpPaymentId_idx" ON "PaymentAuditLog"("mpPaymentId");

-- CreateIndex
CREATE INDEX "PaymentAuditLog_externalReference_idx" ON "PaymentAuditLog"("externalReference");

-- CreateIndex
CREATE INDEX "PaymentAuditLog_internalCheckoutId_idx" ON "PaymentAuditLog"("internalCheckoutId");

-- CreateIndex
CREATE INDEX "PaymentAuditLog_createdAt_idx" ON "PaymentAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "CvAdaptation_mpPaymentId_idx" ON "CvAdaptation"("mpPaymentId");

-- CreateIndex
CREATE INDEX "PlanPurchase_mpPaymentId_idx" ON "PlanPurchase"("mpPaymentId");
