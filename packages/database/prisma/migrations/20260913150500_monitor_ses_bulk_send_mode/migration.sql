-- CreateEnum
CREATE TYPE "EmailBulkSendMode" AS ENUM ('LEGACY_RESEND', 'SES_ROLLOUT', 'SES_LIVE', 'PAUSED');

-- AlterTable
-- Default LEGACY_RESEND preserva o comportamento de produção atual
-- (Resend, todo mundo elegível) até um admin trocar o modo explicitamente
-- em /admin/alerta-vagas, depois que AWS/SNS/webhook estiverem prontos.
ALTER TABLE "MonitorDigestScheduleConfig" ADD COLUMN     "sesMode" "EmailBulkSendMode" NOT NULL DEFAULT 'LEGACY_RESEND';
