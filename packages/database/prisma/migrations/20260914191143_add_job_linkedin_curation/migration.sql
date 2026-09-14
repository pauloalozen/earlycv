-- CreateEnum
CREATE TYPE "LinkedinCurationStatus" AS ENUM ('NOT_CHECKED', 'NOT_FOUND_ON_LINKEDIN', 'FOUND_ON_LINKEDIN', 'INCONCLUSIVE');

-- CreateTable
CREATE TABLE "JobLinkedinCuration" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "LinkedinCurationStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "linkedinUrl" TEXT,
    "checkedByAdminId" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLinkedinCuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobLinkedinCuration_jobId_key" ON "JobLinkedinCuration"("jobId");

-- CreateIndex
CREATE INDEX "JobLinkedinCuration_status_idx" ON "JobLinkedinCuration"("status");

-- AddForeignKey
ALTER TABLE "JobLinkedinCuration" ADD CONSTRAINT "JobLinkedinCuration_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
