-- CreateEnum
CREATE TYPE "MonitorAlertBulkSegment" AS ENUM ('ALL', 'PAID', 'TRACKED_PAID', 'TRACKED_ONLY');

-- CreateTable
CREATE TABLE "MonitorAlertRolloutPolicy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "segment" "MonitorAlertBulkSegment" NOT NULL DEFAULT 'ALL',
    "cutoffAt" TIMESTAMP(3),
    "lastAppliedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAdminId" TEXT,

    CONSTRAINT "MonitorAlertRolloutPolicy_pkey" PRIMARY KEY ("id")
);

-- Seed do singleton com active=false — zero mudança de comportamento até
-- algum admin ativar pelo painel (mesmo espírito da migration que criou
-- MonitorDigestScheduleConfig).
INSERT INTO "MonitorAlertRolloutPolicy" ("id", "active", "segment", "updatedAt")
VALUES ('default', false, 'ALL', CURRENT_TIMESTAMP);
