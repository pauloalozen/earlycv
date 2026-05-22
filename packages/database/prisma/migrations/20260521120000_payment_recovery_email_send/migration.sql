ALTER TABLE "PaymentRecoveryEmail"
ADD COLUMN "recoveryGroupKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN "dryRun" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allowlistMatched" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "realEmailSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "subject" TEXT,
ADD COLUMN "preheader" TEXT,
ADD COLUMN "templateVariables" JSONB,
ADD COLUMN "tokenId" TEXT;

ALTER TABLE "PaymentRecoveryToken"
ADD COLUMN "recoveryGroupKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN "emailRecordId" TEXT;

CREATE UNIQUE INDEX "PaymentRecoveryToken_emailRecordId_key" ON "PaymentRecoveryToken"("emailRecordId");
CREATE UNIQUE INDEX "PaymentRecoveryEmail_tokenId_key" ON "PaymentRecoveryEmail"("tokenId");
CREATE INDEX "PaymentRecoveryEmail_recoveryGroupKey_createdAt_idx" ON "PaymentRecoveryEmail"("recoveryGroupKey", "createdAt");
CREATE INDEX "PaymentRecoveryToken_recoveryGroupKey_createdAt_idx" ON "PaymentRecoveryToken"("recoveryGroupKey", "createdAt");

ALTER TABLE "PaymentRecoveryEmail"
ADD CONSTRAINT "PaymentRecoveryEmail_tokenId_fkey"
FOREIGN KEY ("tokenId") REFERENCES "PaymentRecoveryToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
