-- PR 2a de SEO: fila da Google Indexing API, URL no log, status de revisão
-- de vaga e flag de board global na fonte.
-- CreateEnum
CREATE TYPE "GoogleIndexingQueueStatus" AS ENUM ('pending', 'done', 'failed', 'skipped');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'pending_review';

-- AlterTable
ALTER TABLE "GoogleIndexingLog" ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "JobSource" ADD COLUMN     "isGlobalBoard" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GoogleIndexingQueueItem" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "status" "GoogleIndexingQueueStatus" NOT NULL DEFAULT 'pending',
    "pendingKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "GoogleIndexingQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleIndexingQueueItem_pendingKey_key" ON "GoogleIndexingQueueItem"("pendingKey");

-- CreateIndex
CREATE INDEX "GoogleIndexingQueueItem_status_priority_nextAttemptAt_idx" ON "GoogleIndexingQueueItem"("status", "priority", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "GoogleIndexingQueueItem_status_processedAt_idx" ON "GoogleIndexingQueueItem"("status", "processedAt");


-- Boards globais conhecidos (levantamento de 2026-10-09): vaga só "Remote"
-- dessas fontes vai para revisão em vez de ser aceita como do Brasil.
UPDATE "JobSource"
SET "isGlobalBoard" = true
WHERE "sourceUrl" ~* '^https://(boards|job-boards)\.greenhouse\.io/(datadog|colabsoftware|waymo|scoutmotors|stripe|navapbc|seed|solutions)/?$';
