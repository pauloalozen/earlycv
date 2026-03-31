-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "sessionId" TEXT;

-- Backfill existing rows before enforcing NOT NULL / uniqueness
UPDATE "RefreshToken"
SET "sessionId" = "id"
WHERE "sessionId" IS NULL;

-- AlterTable
ALTER TABLE "RefreshToken" ALTER COLUMN "sessionId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_sessionId_key" ON "RefreshToken"("sessionId");
