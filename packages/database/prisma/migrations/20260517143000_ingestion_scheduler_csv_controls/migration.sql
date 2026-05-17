-- AlterTable
ALTER TABLE "JobSource"
ADD COLUMN "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "scheduleCron" TEXT,
ADD COLUMN "scheduleTimezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
ADD COLUMN "isFallbackAdapter" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "IngestionSchedulerConfig" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "globalCron" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "normalDelayMs" INTEGER NOT NULL DEFAULT 45000,
    "errorDelayMs" INTEGER NOT NULL DEFAULT 90000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionSchedulerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionSchedulerLock" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionSchedulerLock_pkey" PRIMARY KEY ("id")
);
