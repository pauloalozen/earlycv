-- CreateEnum
CREATE TYPE "MonitorProfileStatus" AS ENUM ('INITIALIZING', 'ACTIVE', 'REFRESHING');

-- AlterTable
ALTER TABLE "UserJobRecommendation" ADD COLUMN     "supersededAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserRadarProfile" ADD COLUMN     "lastMatchedAt" TIMESTAMP(3),
ADD COLUMN     "matchFingerprint" TEXT,
ADD COLUMN     "monitorStatus" "MonitorProfileStatus" NOT NULL DEFAULT 'INITIALIZING';

-- CreateTable
CREATE TABLE "MonitorProfileMatchJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MonitorMatchJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "matchedCount" INTEGER,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorProfileMatchJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitorProfileMatchJob_userId_key" ON "MonitorProfileMatchJob"("userId");

-- CreateIndex
CREATE INDEX "MonitorProfileMatchJob_status_createdAt_idx" ON "MonitorProfileMatchJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserJobRecommendation_userId_supersededAt_idx" ON "UserJobRecommendation"("userId", "supersededAt");

-- AddForeignKey
ALTER TABLE "MonitorProfileMatchJob" ADD CONSTRAINT "MonitorProfileMatchJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
