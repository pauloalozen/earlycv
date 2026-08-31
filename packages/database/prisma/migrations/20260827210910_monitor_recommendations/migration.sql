-- CreateEnum
CREATE TYPE "RecommendationFeedback" AS ENUM ('POSITIVE', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "RecommendationFeedbackReason" AS ENUM ('TITLE_MISMATCH', 'AREA_MISMATCH', 'SENIORITY_MISMATCH', 'LOCATION_MISMATCH', 'COMPANY_MISMATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "MonitorMatchJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "UserJobRecommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "opportunityLevel" INTEGER NOT NULL,
    "recommendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "feedback" "RecommendationFeedback",
    "feedbackReason" "RecommendationFeedbackReason",
    "feedbackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserJobRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorMatchJob" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "MonitorMatchJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "matchedCount" INTEGER,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorMatchJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserJobRecommendation_userId_recommendedAt_idx" ON "UserJobRecommendation"("userId", "recommendedAt");

-- CreateIndex
CREATE INDEX "UserJobRecommendation_userId_viewedAt_idx" ON "UserJobRecommendation"("userId", "viewedAt");

-- CreateIndex
CREATE INDEX "UserJobRecommendation_userId_dismissedAt_idx" ON "UserJobRecommendation"("userId", "dismissedAt");

-- CreateIndex
CREATE INDEX "UserJobRecommendation_jobId_idx" ON "UserJobRecommendation"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "UserJobRecommendation_userId_jobId_key" ON "UserJobRecommendation"("userId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorMatchJob_jobId_key" ON "MonitorMatchJob"("jobId");

-- CreateIndex
CREATE INDEX "MonitorMatchJob_status_createdAt_idx" ON "MonitorMatchJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserRadarProfile_areas_idx" ON "UserRadarProfile" USING GIN ("areas");

-- CreateIndex
CREATE INDEX "UserRadarProfile_seniority_idx" ON "UserRadarProfile"("seniority");

-- AddForeignKey
ALTER TABLE "UserJobRecommendation" ADD CONSTRAINT "UserJobRecommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobRecommendation" ADD CONSTRAINT "UserJobRecommendation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorMatchJob" ADD CONSTRAINT "MonitorMatchJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
