-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('SAVED', 'ANALYZED', 'CV_READY', 'APPLIED', 'IN_PROCESS', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "JobApplicationOrigin" AS ENUM ('analysis_auto', 'optimized_cv_auto', 'manual', 'imported_url', 'job_portal');

-- CreateEnum
CREATE TYPE "JobApplicationEventType" AS ENUM ('APPLICATION_CREATED', 'ANALYSIS_COMPLETED', 'CV_READY', 'STATUS_CHANGED', 'NOTE_ADDED', 'MARKED_AS_SENT', 'INTERVIEW_PREP_GENERATED');

-- AlterTable
ALTER TABLE "CvAdaptation" ADD COLUMN     "jobApplicationId" TEXT;

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "normalizedJobTitle" TEXT NOT NULL,
    "normalizedCompanyName" TEXT NOT NULL,
    "location" TEXT,
    "jobUrl" TEXT,
    "jobDescriptionText" TEXT,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'ANALYZED',
    "origin" "JobApplicationOrigin" NOT NULL DEFAULT 'analysis_auto',
    "currentCvAdaptationId" TEXT,
    "scoreBefore" INTEGER,
    "scoreAfter" INTEGER,
    "notes" TEXT,
    "appliedAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplicationEvent" (
    "id" TEXT NOT NULL,
    "jobApplicationId" TEXT NOT NULL,
    "eventType" "JobApplicationEventType" NOT NULL,
    "previousStatus" "JobApplicationStatus",
    "newStatus" "JobApplicationStatus",
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplicationInterviewPrep" (
    "id" TEXT NOT NULL,
    "jobApplicationId" TEXT NOT NULL,
    "generatedContentJson" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplicationInterviewPrep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobApplication_userId_createdAt_idx" ON "JobApplication"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "JobApplication_userId_status_idx" ON "JobApplication"("userId", "status");

-- CreateIndex
CREATE INDEX "JobApplication_userId_normalizedCompanyName_normalizedJobTi_idx" ON "JobApplication"("userId", "normalizedCompanyName", "normalizedJobTitle");

-- CreateIndex
CREATE INDEX "JobApplicationEvent_jobApplicationId_createdAt_idx" ON "JobApplicationEvent"("jobApplicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplicationInterviewPrep_jobApplicationId_key" ON "JobApplicationInterviewPrep"("jobApplicationId");

-- CreateIndex
CREATE INDEX "CvAdaptation_jobApplicationId_idx" ON "CvAdaptation"("jobApplicationId");

-- AddForeignKey
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_jobApplicationId_fkey" FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplicationEvent" ADD CONSTRAINT "JobApplicationEvent_jobApplicationId_fkey" FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplicationInterviewPrep" ADD CONSTRAINT "JobApplicationInterviewPrep_jobApplicationId_fkey" FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
