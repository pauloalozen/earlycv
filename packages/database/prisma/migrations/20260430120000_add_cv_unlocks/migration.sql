-- CreateEnum
CREATE TYPE "CvUnlockSource" AS ENUM ('CREDIT', 'ADMIN', 'PLAN_ENTITLEMENT', 'LEGACY');

-- CreateEnum
CREATE TYPE "CvUnlockStatus" AS ENUM ('UNLOCKED', 'REVOKED');

-- CreateTable
CREATE TABLE "CvUnlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cvAdaptationId" TEXT NOT NULL,
    "creditsConsumed" INTEGER NOT NULL DEFAULT 1,
    "source" "CvUnlockSource" NOT NULL DEFAULT 'CREDIT',
    "status" "CvUnlockStatus" NOT NULL DEFAULT 'UNLOCKED',
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CvUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CvUnlock_cvAdaptationId_key" ON "CvUnlock"("cvAdaptationId");

-- CreateIndex
CREATE INDEX "CvUnlock_userId_idx" ON "CvUnlock"("userId");

-- CreateIndex
CREATE INDEX "CvUnlock_cvAdaptationId_idx" ON "CvUnlock"("cvAdaptationId");

-- CreateIndex
CREATE INDEX "CvUnlock_unlockedAt_idx" ON "CvUnlock"("unlockedAt");

-- CreateIndex
CREATE INDEX "CvUnlock_source_idx" ON "CvUnlock"("source");

-- CreateIndex
CREATE INDEX "CvUnlock_status_idx" ON "CvUnlock"("status");

-- AddForeignKey
ALTER TABLE "CvUnlock" ADD CONSTRAINT "CvUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvUnlock" ADD CONSTRAINT "CvUnlock_cvAdaptationId_fkey" FOREIGN KEY ("cvAdaptationId") REFERENCES "CvAdaptation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CvAdaptation" ADD COLUMN "isUnlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "unlockedAt" TIMESTAMP(3);

-- Legacy one-off backfill: mark already unlocked adaptations without financial transaction as operational unlocks.
INSERT INTO "CvUnlock" (
  "id",
  "userId",
  "cvAdaptationId",
  "creditsConsumed",
  "source",
  "status",
  "unlockedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  concat('legacy_', "id"),
  "userId",
  "id",
  1,
  'LEGACY'::"CvUnlockSource",
  'UNLOCKED'::"CvUnlockStatus",
  COALESCE("paidAt", "updatedAt", "createdAt"),
  COALESCE("createdAt", CURRENT_TIMESTAMP),
  COALESCE("updatedAt", CURRENT_TIMESTAMP)
FROM "CvAdaptation"
WHERE "paymentStatus" = 'completed'
  AND "paymentReference" IS NULL
  AND "mpPaymentId" IS NULL
ON CONFLICT ("cvAdaptationId") DO NOTHING;

-- Backfill operational unlock flags
UPDATE "CvAdaptation" c
SET "isUnlocked" = true,
    "unlockedAt" = COALESCE(c."unlockedAt", c."paidAt", c."updatedAt", c."createdAt")
WHERE c."isUnlocked" = false
  AND EXISTS (
    SELECT 1
    FROM "CvUnlock" u
    WHERE u."cvAdaptationId" = c."id"
      AND u."status" = 'UNLOCKED'
  );
