-- CreateEnum
CREATE TYPE "IngestionBatchRunKind" AS ENUM ('CRAWL', 'LOGO_FETCH');

-- AlterEnum
ALTER TYPE "IngestionJobType" ADD VALUE 'LOGO_FETCH';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "logoFetchedAt" TIMESTAMP(3),
ADD COLUMN     "logoUrl" TEXT;

-- AlterTable
ALTER TABLE "IngestionBatchRun" ADD COLUMN     "runKind" "IngestionBatchRunKind" NOT NULL DEFAULT 'CRAWL';
