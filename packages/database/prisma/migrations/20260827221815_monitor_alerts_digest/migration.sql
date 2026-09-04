-- CreateEnum
CREATE TYPE "SavedJobOrigin" AS ENUM ('RADAR', 'MONITOR');

-- CreateEnum
CREATE TYPE "MonitorDigestFrequency" AS ENUM ('DAILY', 'WEEKLY', 'OFF');

-- CreateEnum
CREATE TYPE "MonitorDigestStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MonitorDigestEventType" AS ENUM ('DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED');

-- AlterTable
ALTER TABLE "SavedJob" ADD COLUMN     "origin" "SavedJobOrigin" NOT NULL DEFAULT 'RADAR';

-- CreateTable
CREATE TABLE "MonitorAlertPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" "MonitorDigestFrequency" NOT NULL DEFAULT 'DAILY',
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorAlertPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorDigest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "frequency" "MonitorDigestFrequency" NOT NULL,
    "status" "MonitorDigestStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorDigest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorDigestRecommendation" (
    "id" TEXT NOT NULL,
    "digestId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorDigestRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorDigestEvent" (
    "id" TEXT NOT NULL,
    "digestId" TEXT,
    "providerMessageId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" "MonitorDigestEventType" NOT NULL,
    "metadataJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorDigestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitorAlertPreference_userId_key" ON "MonitorAlertPreference"("userId");

-- CreateIndex
CREATE INDEX "MonitorDigest_status_scheduledFor_idx" ON "MonitorDigest"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "MonitorDigest_userId_createdAt_idx" ON "MonitorDigest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MonitorDigest_providerMessageId_idx" ON "MonitorDigest"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorDigest_userId_frequency_scheduledFor_key" ON "MonitorDigest"("userId", "frequency", "scheduledFor");

-- CreateIndex
CREATE INDEX "MonitorDigestRecommendation_recommendationId_idx" ON "MonitorDigestRecommendation"("recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorDigestRecommendation_digestId_recommendationId_key" ON "MonitorDigestRecommendation"("digestId", "recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorDigestEvent_providerEventId_key" ON "MonitorDigestEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "MonitorDigestEvent_digestId_idx" ON "MonitorDigestEvent"("digestId");

-- CreateIndex
CREATE INDEX "MonitorDigestEvent_providerMessageId_idx" ON "MonitorDigestEvent"("providerMessageId");

-- AddForeignKey
ALTER TABLE "MonitorAlertPreference" ADD CONSTRAINT "MonitorAlertPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorDigest" ADD CONSTRAINT "MonitorDigest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorDigestRecommendation" ADD CONSTRAINT "MonitorDigestRecommendation_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "MonitorDigest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorDigestRecommendation" ADD CONSTRAINT "MonitorDigestRecommendation_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "UserJobRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorDigestEvent" ADD CONSTRAINT "MonitorDigestEvent_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "MonitorDigest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
