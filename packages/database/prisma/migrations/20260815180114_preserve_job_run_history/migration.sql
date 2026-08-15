/*
  Warnings:

  - Added the required column `jobName` to the `IngestionJobRun` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jobType` to the `IngestionJobRun` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "IngestionJobRun" DROP CONSTRAINT "IngestionJobRun_jobId_fkey";

-- AlterTable
ALTER TABLE "IngestionJob" ADD COLUMN     "isAdHoc" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: colunas nullable primeiro pra poder fazer backfill nas linhas
-- existentes antes de exigir NOT NULL.
ALTER TABLE "IngestionJobRun" ADD COLUMN     "jobName" TEXT,
ADD COLUMN     "jobType" "IngestionJobType",
ALTER COLUMN "jobId" DROP NOT NULL;

-- Backfill: snapshot do nome/tipo do job pai pras execucoes ja existentes.
UPDATE "IngestionJobRun" AS run
SET "jobName" = job.name, "jobType" = job."jobType"
FROM "IngestionJob" AS job
WHERE run."jobId" = job.id;

ALTER TABLE "IngestionJobRun" ALTER COLUMN "jobName" SET NOT NULL,
ALTER COLUMN "jobType" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "IngestionJobRun" ADD CONSTRAINT "IngestionJobRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "IngestionJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
