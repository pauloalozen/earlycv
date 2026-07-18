-- DropForeignKey
ALTER TABLE "CvAdaptation" DROP CONSTRAINT "CvAdaptation_masterResumeId_fkey";

-- AlterTable
ALTER TABLE "CvAdaptation" ALTER COLUMN "masterResumeId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_masterResumeId_fkey" FOREIGN KEY ("masterResumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
