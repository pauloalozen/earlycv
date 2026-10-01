-- Entrevista Simulada: compra avulsa + histórico + oferta por e-mail.
-- Só aditivo: nenhum dado existente é alterado ou apagado.

-- Novo tipo de envio do dispatch e chave de template.
ALTER TYPE "EmailDispatchKind" ADD VALUE 'MOCK_INTERVIEW_OFFER';
ALTER TYPE "EmailTemplateKey" ADD VALUE 'MOCK_INTERVIEW_OFFER';

-- Modo próprio da oferta (OFF por padrão).
ALTER TABLE "EmailDispatchSettings"
  ADD COLUMN "mockInterviewOfferMode" "EmailDispatchMode" NOT NULL DEFAULT 'OFF';

-- CreateEnum
CREATE TYPE "MockInterviewSessionStatus" AS ENUM ('AWAITING_SCHEDULING', 'SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "MockInterviewOrigin" AS ENUM ('landing', 'application_offer', 'offer_email', 'showcase', 'other');

-- CreateTable
CREATE TABLE "MockInterviewPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountInCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'mercadopago',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "mpPaymentId" TEXT,
    "mpPreferenceId" TEXT,
    "mpMerchantOrderId" TEXT,
    "origin" "MockInterviewOrigin" NOT NULL DEFAULT 'landing',
    "originJobApplicationId" TEXT,
    "policyVersion" TEXT NOT NULL,
    "policyAcceptedAt" TIMESTAMP(3) NOT NULL,
    "sessionStatus" "MockInterviewSessionStatus" NOT NULL DEFAULT 'AWAITING_SCHEDULING',
    "scheduledAt" TIMESTAMP(3),
    "meetingUrl" TEXT,
    "completedAt" TIMESTAMP(3),
    "reportSentAt" TIMESTAMP(3),
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "adminNotes" TEXT,
    "adminNotifyClaimedAt" TIMESTAMP(3),
    "adminNotifiedAt" TIMESTAMP(3),
    "adminNotifyError" TEXT,
    "buyerNotifyClaimedAt" TIMESTAMP(3),
    "buyerNotifiedAt" TIMESTAMP(3),
    "buyerNotifyError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockInterviewPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockInterviewEvent" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockInterviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MockInterviewPurchase_userId_createdAt_idx" ON "MockInterviewPurchase"("userId", "createdAt");
CREATE INDEX "MockInterviewPurchase_paymentStatus_createdAt_idx" ON "MockInterviewPurchase"("paymentStatus", "createdAt");
CREATE INDEX "MockInterviewPurchase_sessionStatus_scheduledAt_idx" ON "MockInterviewPurchase"("sessionStatus", "scheduledAt");
CREATE INDEX "MockInterviewPurchase_mpPaymentId_idx" ON "MockInterviewPurchase"("mpPaymentId");
CREATE INDEX "MockInterviewPurchase_originJobApplicationId_idx" ON "MockInterviewPurchase"("originJobApplicationId");
CREATE INDEX "MockInterviewEvent_purchaseId_createdAt_idx" ON "MockInterviewEvent"("purchaseId", "createdAt");

-- AddForeignKey
ALTER TABLE "MockInterviewPurchase" ADD CONSTRAINT "MockInterviewPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MockInterviewEvent" ADD CONSTRAINT "MockInterviewEvent_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "MockInterviewPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
