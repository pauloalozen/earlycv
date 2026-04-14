-- AlterTable
ALTER TABLE "User" ADD COLUMN "analysisCreditsRemaining" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "UserDailyAnalysisUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usageDate" TIMESTAMP(3) NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDailyAnalysisUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserDailyAnalysisUsage_userId_usageDate_key" ON "UserDailyAnalysisUsage"("userId", "usageDate");

-- CreateIndex
CREATE INDEX "UserDailyAnalysisUsage_usageDate_idx" ON "UserDailyAnalysisUsage"("usageDate");

-- AddForeignKey
ALTER TABLE "UserDailyAnalysisUsage" ADD CONSTRAINT "UserDailyAnalysisUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
