-- CreateEnum
CREATE TYPE "IngestionJobType" AS ENUM ('CRAWL', 'ENRICHMENT');

-- CreateEnum
CREATE TYPE "IngestionJobScopeType" AS ENUM ('ADAPTER', 'SOURCE', 'ALL');

-- CreateEnum
CREATE TYPE "IngestionJobScheduleType" AS ENUM ('MANUAL', 'DAILY', 'EVERY_N_HOURS', 'WEEKLY');

-- CreateEnum
CREATE TYPE "IngestionJobRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IngestionJobTrigger" AS ENUM ('SCHEDULE', 'MANUAL');

-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "jobType" "IngestionJobType" NOT NULL,
    "scopeType" "IngestionJobScopeType",
    "adapterType" "JobSourceType",
    "jobSourceId" TEXT,
    "scheduleType" "IngestionJobScheduleType" NOT NULL,
    "scheduleHour" INTEGER,
    "scheduleMinute" INTEGER NOT NULL DEFAULT 0,
    "scheduleInterval" INTEGER,
    "scheduleDaysOfWeek" INTEGER[],
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionJobRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "batchRunId" TEXT,
    "status" "IngestionJobRunStatus" NOT NULL DEFAULT 'QUEUED',
    "triggeredBy" "IngestionJobTrigger" NOT NULL DEFAULT 'SCHEDULE',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestionJob_jobType_isEnabled_idx" ON "IngestionJob"("jobType", "isEnabled");

-- CreateIndex
CREATE INDEX "IngestionJob_nextRunAt_idx" ON "IngestionJob"("nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionJobRun_batchRunId_key" ON "IngestionJobRun"("batchRunId");

-- CreateIndex
CREATE INDEX "IngestionJobRun_jobId_createdAt_idx" ON "IngestionJobRun"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "IngestionJobRun_status_idx" ON "IngestionJobRun"("status");

-- AddForeignKey
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_jobSourceId_fkey" FOREIGN KEY ("jobSourceId") REFERENCES "JobSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionJobRun" ADD CONSTRAINT "IngestionJobRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "IngestionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionJobRun" ADD CONSTRAINT "IngestionJobRun_batchRunId_fkey" FOREIGN KEY ("batchRunId") REFERENCES "IngestionBatchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
