-- CreateEnum
CREATE TYPE "IngestionRunStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "jobSourceId" TEXT NOT NULL,
    "status" "IngestionRunStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "previewJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestionRun_jobSourceId_createdAt_idx" ON "IngestionRun"("jobSourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_jobSourceId_fkey" FOREIGN KEY ("jobSourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
