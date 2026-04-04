-- CreateEnum
CREATE TYPE "CvAdaptationStatus" AS ENUM ('pending', 'analyzing', 'awaiting_payment', 'paid', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('none', 'pending', 'completed', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('mercadopago', 'stripe');

-- AlterTable
ALTER TABLE "ResumeTemplate" ADD COLUMN "previewImageUrl" TEXT;

-- CreateTable
CREATE TABLE "CvAdaptation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "masterResumeId" TEXT NOT NULL,
    "templateId" TEXT,
    "jobDescriptionText" TEXT NOT NULL,
    "jobTitle" TEXT,
    "companyName" TEXT,
    "status" "CvAdaptationStatus" NOT NULL DEFAULT 'pending',
    "adaptedContentJson" JSONB,
    "previewText" TEXT,
    "adaptedResumeId" TEXT UNIQUE,
    "aiAuditJson" JSONB,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'none',
    "paymentProvider" "PaymentProvider",
    "paymentReference" TEXT UNIQUE,
    "paymentAmountInCents" INTEGER,
    "paymentCurrency" TEXT DEFAULT 'BRL',
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CvAdaptation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CvAdaptation_userId_createdAt_idx" ON "CvAdaptation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CvAdaptation_masterResumeId_idx" ON "CvAdaptation"("masterResumeId");

-- CreateIndex
CREATE INDEX "CvAdaptation_paymentReference_idx" ON "CvAdaptation"("paymentReference");

-- AddForeignKey
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_masterResumeId_fkey" FOREIGN KEY ("masterResumeId") REFERENCES "Resume"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ResumeTemplate"("id") ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_adaptedResumeId_fkey" FOREIGN KEY ("adaptedResumeId") REFERENCES "Resume"("id") ON DELETE SET NULL;
