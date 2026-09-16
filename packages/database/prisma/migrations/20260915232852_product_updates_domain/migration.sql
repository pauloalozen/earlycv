-- CreateEnum
CREATE TYPE "ProductUpdateStatus" AS ENUM ('DRAFT', 'READY', 'SENDING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProductUpdateAudience" AS ENUM ('INTERNAL_TEST', 'ALL_ELIGIBLE_USERS');

-- CreateEnum
CREATE TYPE "ProductUpdateDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductUpdateEventType" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'REJECTED', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "ProductUpdateSuppressionReason" AS ENUM ('BOUNCED', 'COMPLAINED', 'SES_OPT_OUT');

-- CreateTable
CREATE TABLE "ProductUpdate" (
    "id" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "content" TEXT NOT NULL,
    "primaryButtonText" TEXT,
    "primaryButtonUrl" TEXT,
    "optionalFooterContent" TEXT,
    "htmlSnapshot" TEXT,
    "textSnapshot" TEXT,
    "audience" "ProductUpdateAudience",
    "status" "ProductUpdateStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "testSentAt" TIMESTAMP(3),
    "testSentBy" TEXT,
    "testRecipientEmail" TEXT,
    "createdBy" TEXT NOT NULL,
    "startedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "ProductUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUpdateDelivery" (
    "id" TEXT NOT NULL,
    "productUpdateId" TEXT NOT NULL,
    "userId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "status" "ProductUpdateDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "provider" "EmailProviderName" NOT NULL DEFAULT 'SES',
    "outcomeUnknownAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUpdateDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUpdateEvent" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT,
    "providerMessageId" TEXT,
    "providerEventId" TEXT NOT NULL,
    "type" "ProductUpdateEventType" NOT NULL,
    "metadataJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "provider" "EmailProviderName" NOT NULL DEFAULT 'SES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductUpdateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEmailSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscribed" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribedAt" TIMESTAMP(3),
    "suppressionReason" "ProductUpdateSuppressionReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductEmailSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductUpdate_status_createdAt_idx" ON "ProductUpdate"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductUpdateDelivery_status_createdAt_idx" ON "ProductUpdateDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductUpdateDelivery_providerMessageId_idx" ON "ProductUpdateDelivery"("providerMessageId");

-- CreateIndex
CREATE INDEX "ProductUpdateDelivery_status_outcomeUnknownAt_idx" ON "ProductUpdateDelivery"("status", "outcomeUnknownAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUpdateDelivery_productUpdateId_userId_key" ON "ProductUpdateDelivery"("productUpdateId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUpdateEvent_providerEventId_key" ON "ProductUpdateEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "ProductUpdateEvent_deliveryId_idx" ON "ProductUpdateEvent"("deliveryId");

-- CreateIndex
CREATE INDEX "ProductUpdateEvent_providerMessageId_idx" ON "ProductUpdateEvent"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEmailSubscription_userId_key" ON "ProductEmailSubscription"("userId");

-- AddForeignKey
ALTER TABLE "ProductUpdateDelivery" ADD CONSTRAINT "ProductUpdateDelivery_productUpdateId_fkey" FOREIGN KEY ("productUpdateId") REFERENCES "ProductUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUpdateDelivery" ADD CONSTRAINT "ProductUpdateDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUpdateEvent" ADD CONSTRAINT "ProductUpdateEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "ProductUpdateDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductEmailSubscription" ADD CONSTRAINT "ProductEmailSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
