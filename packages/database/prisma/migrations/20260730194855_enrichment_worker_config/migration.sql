-- AlterTable
ALTER TABLE "IngestionSchedulerConfig" ADD COLUMN     "enrichmentBatchSize" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "enrichmentCronExpression" TEXT NOT NULL DEFAULT '*/10 * * * * *',
ADD COLUMN     "enrichmentEnabled" BOOLEAN NOT NULL DEFAULT true;
