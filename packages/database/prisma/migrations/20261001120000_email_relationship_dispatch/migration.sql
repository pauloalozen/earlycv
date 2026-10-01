-- CreateEnum
CREATE TYPE "EmailDispatchKind" AS ENUM ('WELCOME', 'FEEDBACK_FIRST_USE', 'PURCHASE_CONFIRMATION');

-- CreateEnum
CREATE TYPE "EmailDispatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailDispatchEventType" AS ENUM ('SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmailSuppressionReason" AS ENUM ('HARD_BOUNCE', 'COMPLAINT');

-- CreateEnum
CREATE TYPE "EmailDispatchMode" AS ENUM ('OFF', 'SHADOW', 'ALLOWLIST', 'LIVE');

-- CreateEnum
CREATE TYPE "EmailTemplateKey" AS ENUM ('WELCOME', 'FEEDBACK_VIEWED', 'FEEDBACK_NEUTRAL', 'PURCHASE_PAID', 'PURCHASE_COUPON');

-- CreateTable
CREATE TABLE "EmailDispatch" (
    "id" TEXT NOT NULL,
    "kind" "EmailDispatchKind" NOT NULL,
    "userId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "referenceId" TEXT,
    "payloadJson" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "status" "EmailDispatchStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "variant" TEXT,
    "skippedReason" TEXT,
    "lastError" TEXT,
    "provider" "EmailProviderName" NOT NULL DEFAULT 'SES',
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "outcomeUnknownAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDispatchEvent" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT,
    "providerMessageId" TEXT,
    "providerEventId" TEXT NOT NULL,
    "type" "EmailDispatchEventType" NOT NULL,
    "metadataJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "provider" "EmailProviderName" NOT NULL DEFAULT 'SES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDispatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationshipEmailPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscribed" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationshipEmailPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "EmailSuppressionReason" NOT NULL,
    "bounceSubType" TEXT,
    "sourceCategory" TEXT,
    "providerEventId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDispatchSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "welcomeMode" "EmailDispatchMode" NOT NULL DEFAULT 'OFF',
    "feedbackMode" "EmailDispatchMode" NOT NULL DEFAULT 'OFF',
    "purchaseConfirmationMode" "EmailDispatchMode" NOT NULL DEFAULT 'OFF',
    "startAt" TIMESTAMP(3),
    "allowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extraBlocklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedByAdminId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDispatchSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDispatchTemplate" (
    "key" "EmailTemplateKey" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByAdminId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDispatchTemplate_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDispatch_dedupeKey_key" ON "EmailDispatch"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailDispatch_status_scheduledFor_idx" ON "EmailDispatch"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "EmailDispatch_providerMessageId_idx" ON "EmailDispatch"("providerMessageId");

-- CreateIndex
CREATE INDEX "EmailDispatch_userId_kind_idx" ON "EmailDispatch"("userId", "kind");

-- CreateIndex
CREATE INDEX "EmailDispatch_referenceId_idx" ON "EmailDispatch"("referenceId");

-- CreateIndex
CREATE INDEX "EmailDispatch_status_outcomeUnknownAt_idx" ON "EmailDispatch"("status", "outcomeUnknownAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDispatchEvent_providerEventId_key" ON "EmailDispatchEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "EmailDispatchEvent_dispatchId_idx" ON "EmailDispatchEvent"("dispatchId");

-- CreateIndex
CREATE INDEX "EmailDispatchEvent_providerMessageId_idx" ON "EmailDispatchEvent"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipEmailPreference_userId_key" ON "RelationshipEmailPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_email_key" ON "EmailSuppression"("email");

-- AddForeignKey
ALTER TABLE "EmailDispatch" ADD CONSTRAINT "EmailDispatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDispatchEvent" ADD CONSTRAINT "EmailDispatchEvent_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "EmailDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipEmailPreference" ADD CONSTRAINT "RelationshipEmailPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

