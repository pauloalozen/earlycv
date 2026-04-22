-- CreateEnum
CREATE TYPE "AnalysisConfigValueType" AS ENUM ('boolean', 'int', 'duration_ms', 'percent', 'string', 'enum', 'json');

-- CreateEnum
CREATE TYPE "AnalysisConfigRiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "AnalysisProtectionConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "valueType" "AnalysisConfigValueType" NOT NULL,
    "riskLevel" "AnalysisConfigRiskLevel" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisProtectionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisProtectionConfigAudit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "oldValueJson" JSONB,
    "newValueJson" JSONB,
    "valueType" "AnalysisConfigValueType" NOT NULL,
    "riskLevel" "AnalysisConfigRiskLevel" NOT NULL,
    "actorId" TEXT,
    "actorRole" "InternalRole" NOT NULL DEFAULT 'none',
    "source" TEXT NOT NULL,
    "technicalContextJson" JSONB,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisProtectionConfigAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisSession" (
    "id" TEXT NOT NULL,
    "sessionPublicTokenHash" TEXT NOT NULL,
    "userId" TEXT,
    "userAgentHash" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRequestFingerprint" (
    "id" TEXT NOT NULL,
    "canonicalHash" TEXT NOT NULL,
    "sessionInternalId" TEXT,
    "userId" TEXT,
    "ipHash" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisRequestFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisUsageCounter" (
    "id" TEXT NOT NULL,
    "counterKey" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "sessionInternalId" TEXT,
    "userId" TEXT,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "windowEndsAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisUsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisProtectionEvent" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "requestId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "sessionInternalId" TEXT,
    "userId" TEXT,
    "routeKey" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisProtectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessFunnelEvent" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL,
    "idempotencyKey" TEXT,
    "requestId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "sessionInternalId" TEXT,
    "userId" TEXT,
    "routeKey" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessFunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessFunnelStageMetric" (
    "id" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "metricDate" TIMESTAMP(3) NOT NULL,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "avgLatencyMs" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessFunnelStageMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisProtectionConfig_key_key" ON "AnalysisProtectionConfig"("key");

-- CreateIndex
CREATE INDEX "AnalysisProtectionConfigAudit_key_changedAt_idx" ON "AnalysisProtectionConfigAudit"("key", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisSession_sessionPublicTokenHash_key" ON "AnalysisSession"("sessionPublicTokenHash");

-- CreateIndex
CREATE INDEX "AnalysisSession_userId_idx" ON "AnalysisSession"("userId");

-- CreateIndex
CREATE INDEX "AnalysisRequestFingerprint_canonicalHash_idx" ON "AnalysisRequestFingerprint"("canonicalHash");

-- CreateIndex
CREATE INDEX "AnalysisRequestFingerprint_sessionInternalId_idx" ON "AnalysisRequestFingerprint"("sessionInternalId");

-- CreateIndex
CREATE INDEX "AnalysisRequestFingerprint_userId_idx" ON "AnalysisRequestFingerprint"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisRequestFingerprint_aggregationKey_key" ON "AnalysisRequestFingerprint"("canonicalHash", COALESCE("sessionInternalId", ''), COALESCE("userId", ''), COALESCE("ipHash", ''));

-- CreateIndex
CREATE INDEX "AnalysisUsageCounter_counterKey_periodKey_idx" ON "AnalysisUsageCounter"("counterKey", "periodKey");

-- CreateIndex
CREATE INDEX "AnalysisUsageCounter_sessionInternalId_idx" ON "AnalysisUsageCounter"("sessionInternalId");

-- CreateIndex
CREATE INDEX "AnalysisUsageCounter_userId_idx" ON "AnalysisUsageCounter"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisUsageCounter_bucketKey_key" ON "AnalysisUsageCounter"("counterKey", "periodKey", COALESCE("sessionInternalId", ''), COALESCE("userId", ''));

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisProtectionEvent_idempotencyKey_key" ON "AnalysisProtectionEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AnalysisProtectionEvent_eventName_createdAt_idx" ON "AnalysisProtectionEvent"("eventName", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisProtectionEvent_requestId_idx" ON "AnalysisProtectionEvent"("requestId");

-- CreateIndex
CREATE INDEX "AnalysisProtectionEvent_correlationId_idx" ON "AnalysisProtectionEvent"("correlationId");

-- CreateIndex
CREATE INDEX "AnalysisProtectionEvent_sessionInternalId_idx" ON "AnalysisProtectionEvent"("sessionInternalId");

-- CreateIndex
CREATE INDEX "AnalysisProtectionEvent_userId_idx" ON "AnalysisProtectionEvent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessFunnelEvent_idempotencyKey_key" ON "BusinessFunnelEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BusinessFunnelEvent_eventName_createdAt_idx" ON "BusinessFunnelEvent"("eventName", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessFunnelEvent_requestId_idx" ON "BusinessFunnelEvent"("requestId");

-- CreateIndex
CREATE INDEX "BusinessFunnelEvent_correlationId_idx" ON "BusinessFunnelEvent"("correlationId");

-- CreateIndex
CREATE INDEX "BusinessFunnelEvent_sessionInternalId_idx" ON "BusinessFunnelEvent"("sessionInternalId");

-- CreateIndex
CREATE INDEX "BusinessFunnelEvent_userId_idx" ON "BusinessFunnelEvent"("userId");

-- CreateIndex
CREATE INDEX "BusinessFunnelStageMetric_metricDate_idx" ON "BusinessFunnelStageMetric"("metricDate");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessFunnelStageMetric_stageKey_metricDate_key" ON "BusinessFunnelStageMetric"("stageKey", "metricDate");

-- AddForeignKey
ALTER TABLE "AnalysisSession" ADD CONSTRAINT "AnalysisSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRequestFingerprint" ADD CONSTRAINT "AnalysisRequestFingerprint_sessionInternalId_fkey" FOREIGN KEY ("sessionInternalId") REFERENCES "AnalysisSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRequestFingerprint" ADD CONSTRAINT "AnalysisRequestFingerprint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisUsageCounter" ADD CONSTRAINT "AnalysisUsageCounter_sessionInternalId_fkey" FOREIGN KEY ("sessionInternalId") REFERENCES "AnalysisSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisUsageCounter" ADD CONSTRAINT "AnalysisUsageCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisProtectionEvent" ADD CONSTRAINT "AnalysisProtectionEvent_sessionInternalId_fkey" FOREIGN KEY ("sessionInternalId") REFERENCES "AnalysisSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisProtectionEvent" ADD CONSTRAINT "AnalysisProtectionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessFunnelEvent" ADD CONSTRAINT "BusinessFunnelEvent_sessionInternalId_fkey" FOREIGN KEY ("sessionInternalId") REFERENCES "AnalysisSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessFunnelEvent" ADD CONSTRAINT "BusinessFunnelEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
