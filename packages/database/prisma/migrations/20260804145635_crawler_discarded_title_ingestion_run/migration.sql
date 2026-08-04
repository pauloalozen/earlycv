-- AlterTable
ALTER TABLE "CrawlerDiscardedTitle" ADD COLUMN     "ingestionRunId" TEXT;

-- CreateIndex
CREATE INDEX "CrawlerDiscardedTitle_ingestionRunId_idx" ON "CrawlerDiscardedTitle"("ingestionRunId");

-- AddForeignKey
ALTER TABLE "CrawlerDiscardedTitle" ADD CONSTRAINT "CrawlerDiscardedTitle_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
