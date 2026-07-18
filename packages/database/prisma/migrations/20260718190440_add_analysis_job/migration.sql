-- CreateEnum
CREATE TYPE "AnalysisJobStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "AnalysisJobOwnerKind" AS ENUM ('guest', 'authenticated');

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL,
    "ownerKind" "AnalysisJobOwnerKind" NOT NULL,
    "status" "AnalysisJobStatus" NOT NULL DEFAULT 'pending',
    "userId" TEXT,
    "guestSessionHash" TEXT,
    "jobDescriptionText" TEXT NOT NULL,
    "masterCvText" TEXT NOT NULL,
    "jobTitle" TEXT,
    "companyName" TEXT,
    "adaptedContentJson" JSONB,
    "previewText" TEXT,
    "scoreBefore" INTEGER,
    "scoreAfter" INTEGER,
    "analysisCvSnapshotId" TEXT,
    "lastError" TEXT,
    "convertedAt" TIMESTAMP(3),
    "convertedCvAdaptationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisJob_analysisCvSnapshotId_key" ON "AnalysisJob"("analysisCvSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisJob_convertedCvAdaptationId_key" ON "AnalysisJob"("convertedCvAdaptationId");

-- CreateIndex
CREATE INDEX "AnalysisJob_userId_idx" ON "AnalysisJob"("userId");

-- CreateIndex
CREATE INDEX "AnalysisJob_guestSessionHash_idx" ON "AnalysisJob"("guestSessionHash");

-- CreateIndex
CREATE INDEX "AnalysisJob_status_idx" ON "AnalysisJob"("status");

-- CreateIndex
CREATE INDEX "AnalysisJob_createdAt_idx" ON "AnalysisJob"("createdAt");

-- CreateIndex
CREATE INDEX "AnalysisJob_convertedAt_idx" ON "AnalysisJob"("convertedAt");

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_analysisCvSnapshotId_fkey" FOREIGN KEY ("analysisCvSnapshotId") REFERENCES "AnalysisCvSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_convertedCvAdaptationId_fkey" FOREIGN KEY ("convertedCvAdaptationId") REFERENCES "CvAdaptation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
