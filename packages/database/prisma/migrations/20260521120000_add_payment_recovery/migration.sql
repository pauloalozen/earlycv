CREATE TYPE "PaymentRecoveryEligibilityStatus" AS ENUM ('eligible', 'possibly_resolved', 'not_eligible');

CREATE TYPE "PaymentRecoveryEmailStatus" AS ENUM ('sent', 'failed', 'skipped');

CREATE TABLE "PaymentRecoveryEmail" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "adaptationId" TEXT,
  "step" TEXT NOT NULL DEFAULT 'manual_admin',
  "status" "PaymentRecoveryEmailStatus" NOT NULL,
  "sentByAdminUserId" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "clickedAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentRecoveryEmail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentRecoveryToken" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "adaptationId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentRecoveryToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentRecoveryIgnore" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "adaptationId" TEXT,
  "reason" TEXT,
  "ignoredByAdminId" TEXT NOT NULL,
  "ignoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentRecoveryIgnore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentRecoveryToken_tokenHash_key" ON "PaymentRecoveryToken"("tokenHash");
CREATE UNIQUE INDEX "PaymentRecoveryIgnore_purchaseId_key" ON "PaymentRecoveryIgnore"("purchaseId");

CREATE INDEX "PaymentRecoveryEmail_purchaseId_createdAt_idx" ON "PaymentRecoveryEmail"("purchaseId", "createdAt");
CREATE INDEX "PaymentRecoveryEmail_userId_createdAt_idx" ON "PaymentRecoveryEmail"("userId", "createdAt");
CREATE INDEX "PaymentRecoveryEmail_adaptationId_idx" ON "PaymentRecoveryEmail"("adaptationId");

CREATE INDEX "PaymentRecoveryToken_purchaseId_createdAt_idx" ON "PaymentRecoveryToken"("purchaseId", "createdAt");
CREATE INDEX "PaymentRecoveryToken_userId_createdAt_idx" ON "PaymentRecoveryToken"("userId", "createdAt");
CREATE INDEX "PaymentRecoveryToken_expiresAt_idx" ON "PaymentRecoveryToken"("expiresAt");

CREATE INDEX "PaymentRecoveryIgnore_userId_idx" ON "PaymentRecoveryIgnore"("userId");
CREATE INDEX "PaymentRecoveryIgnore_adaptationId_idx" ON "PaymentRecoveryIgnore"("adaptationId");
CREATE INDEX "PaymentRecoveryIgnore_ignoredAt_idx" ON "PaymentRecoveryIgnore"("ignoredAt");
