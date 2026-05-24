-- AlterTable
ALTER TABLE "JobSource" ADD COLUMN     "consecutive403Count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pauseReason" TEXT,
ADD COLUMN     "pausedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PaymentRecoveryEmail" ALTER COLUMN "recoveryGroupKey" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PaymentRecoveryToken" ALTER COLUMN "recoveryGroupKey" DROP DEFAULT;
