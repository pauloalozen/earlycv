-- CreateEnum
CREATE TYPE "IngestionBatchScopeType" AS ENUM ('adapter', 'source', 'global');

-- CreateEnum
CREATE TYPE "IngestionBatchRunStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelling', 'cancelled');

-- CreateEnum
CREATE TYPE "IngestionBatchItemStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'skipped', 'cancelled');

-- CreateTable
CREATE TABLE "IngestionBatchRun" (
    "id" TEXT NOT NULL,
    "scopeType" "IngestionBatchScopeType" NOT NULL,
    "scopeValue" TEXT NOT NULL,
    "status" "IngestionBatchRunStatus" NOT NULL DEFAULT 'queued',
    "requestedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "totalSources" INTEGER NOT NULL DEFAULT 0,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionBatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionBatchItem" (
    "id" TEXT NOT NULL,
    "batchRunId" TEXT NOT NULL,
    "jobSourceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceType" "JobSourceType" NOT NULL,
    "status" "IngestionBatchItemStatus" NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "ingestionRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestionBatchRun_status_createdAt_idx" ON "IngestionBatchRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IngestionBatchRun_scopeType_scopeValue_createdAt_idx" ON "IngestionBatchRun"("scopeType", "scopeValue", "createdAt");

-- CreateIndex
CREATE INDEX "IngestionBatchRun_requestedByUserId_createdAt_idx" ON "IngestionBatchRun"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "IngestionBatchItem_batchRunId_status_createdAt_idx" ON "IngestionBatchItem"("batchRunId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "IngestionBatchItem_status_updatedAt_idx" ON "IngestionBatchItem"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "IngestionBatchItem_jobSourceId_idx" ON "IngestionBatchItem"("jobSourceId");

-- CreateIndex
CREATE INDEX "IngestionBatchItem_companyId_idx" ON "IngestionBatchItem"("companyId");

-- CreateIndex
CREATE INDEX "IngestionBatchItem_ingestionRunId_idx" ON "IngestionBatchItem"("ingestionRunId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionBatchItem_batchRunId_jobSourceId_key" ON "IngestionBatchItem"("batchRunId", "jobSourceId");

-- AddForeignKey
ALTER TABLE "IngestionBatchRun" ADD CONSTRAINT "IngestionBatchRun_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionBatchItem" ADD CONSTRAINT "IngestionBatchItem_batchRunId_fkey" FOREIGN KEY ("batchRunId") REFERENCES "IngestionBatchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionBatchItem" ADD CONSTRAINT "IngestionBatchItem_jobSourceId_fkey" FOREIGN KEY ("jobSourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionBatchItem" ADD CONSTRAINT "IngestionBatchItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionBatchItem" ADD CONSTRAINT "IngestionBatchItem_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
