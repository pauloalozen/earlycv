-- DropForeignKey
ALTER TABLE "CvProcessingJob" DROP CONSTRAINT "CvProcessingJob_cvSourceId_fkey";

-- DropForeignKey
ALTER TABLE "CvProcessingJob" DROP CONSTRAINT "CvProcessingJob_cvSubmissionId_fkey";

-- AddForeignKey
ALTER TABLE "CvProcessingJob" ADD CONSTRAINT "CvProcessingJob_cvSourceId_fkey" FOREIGN KEY ("cvSourceId") REFERENCES "CvSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvProcessingJob" ADD CONSTRAINT "CvProcessingJob_cvSubmissionId_fkey" FOREIGN KEY ("cvSubmissionId") REFERENCES "CvSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
