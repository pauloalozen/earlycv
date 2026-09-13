-- CreateEnum
CREATE TYPE "EmailProviderName" AS ENUM ('RESEND', 'SES');

-- AlterEnum
ALTER TYPE "MonitorAlertBulkSegment" ADD VALUE 'INTERNAL';

-- AlterEnum
ALTER TYPE "MonitorDigestStatus" ADD VALUE 'OUTCOME_UNKNOWN';

-- AlterTable
ALTER TABLE "MonitorDigest" ADD COLUMN     "outcomeUnknownAt" TIMESTAMP(3),
ADD COLUMN     "provider" "EmailProviderName" NOT NULL DEFAULT 'RESEND';

-- AlterTable
ALTER TABLE "MonitorDigestEvent" ADD COLUMN     "provider" "EmailProviderName" NOT NULL DEFAULT 'RESEND';

-- AlterTable
ALTER TABLE "MonitorDigestScheduleConfig" ADD COLUMN     "sesRolloutSegment" "MonitorAlertBulkSegment";

-- CreateIndex
CREATE INDEX "MonitorDigest_status_outcomeUnknownAt_idx" ON "MonitorDigest"("status", "outcomeUnknownAt");
