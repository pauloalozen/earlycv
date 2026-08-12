-- CreateTable
CREATE TABLE "EnrichmentBatchRun" (
    "id" TEXT NOT NULL,
    "status" "IngestionJobRunStatus" NOT NULL DEFAULT 'QUEUED',
    "triggeredBy" "IngestionJobTrigger" NOT NULL DEFAULT 'SCHEDULE',
    "batchSize" INTEGER NOT NULL,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "cancelRequestedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrichmentBatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnrichmentBatchRun_status_createdAt_idx" ON "EnrichmentBatchRun"("status", "createdAt");
