-- AlterEnum
ALTER TYPE "IngestionBatchRunKind" ADD VALUE 'DISCOVERY_VALIDATE';

-- AlterEnum
ALTER TYPE "IngestionJobType" ADD VALUE 'DISCOVERY_VALIDATE';

-- AlterTable
ALTER TABLE "IngestionBatchItem" ADD COLUMN     "discoveredCompanyId" TEXT,
ALTER COLUMN "jobSourceId" DROP NOT NULL,
ALTER COLUMN "companyId" DROP NOT NULL,
ALTER COLUMN "sourceName" DROP NOT NULL,
ALTER COLUMN "sourceType" DROP NOT NULL;

-- AlterTable
ALTER TABLE "IngestionJob" ADD COLUMN     "discoveryValidateLimit" INTEGER;

-- CreateIndex
CREATE INDEX "IngestionBatchItem_discoveredCompanyId_idx" ON "IngestionBatchItem"("discoveredCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionBatchItem_batchRunId_discoveredCompanyId_key" ON "IngestionBatchItem"("batchRunId", "discoveredCompanyId");

-- AddForeignKey
ALTER TABLE "IngestionBatchItem" ADD CONSTRAINT "IngestionBatchItem_discoveredCompanyId_fkey" FOREIGN KEY ("discoveredCompanyId") REFERENCES "DiscoveredCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

