-- AlterTable
ALTER TABLE "IngestionSchedulerConfig" ALTER COLUMN "normalDelayMs" SET DEFAULT 22000,
ALTER COLUMN "errorDelayMs" SET DEFAULT 45000;
