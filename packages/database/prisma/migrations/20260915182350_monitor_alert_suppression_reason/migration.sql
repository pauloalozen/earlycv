-- CreateEnum
CREATE TYPE "MonitorAlertSuppressionReason" AS ENUM ('USER_UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED');

-- AlterTable
-- Nullable, sem default: preferências desativadas antes desta coluna
-- existir ficam com motivo desconhecido (não recuperável), nunca
-- backfilled com um valor adivinhado.
ALTER TABLE "MonitorAlertPreference" ADD COLUMN     "suppressionReason" "MonitorAlertSuppressionReason";
