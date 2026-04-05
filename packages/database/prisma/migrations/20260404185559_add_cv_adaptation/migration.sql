/*
  Warnings:

  - You are about to drop the column `isPrimary` on the `Resume` table. All the data in the column will be lost.
  - You are about to drop the column `primaryResumeSlot` on the `Resume` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "CvAdaptation" DROP CONSTRAINT "CvAdaptation_adaptedResumeId_fkey";

-- DropForeignKey
ALTER TABLE "CvAdaptation" DROP CONSTRAINT "CvAdaptation_masterResumeId_fkey";

-- DropForeignKey
ALTER TABLE "CvAdaptation" DROP CONSTRAINT "CvAdaptation_templateId_fkey";

-- DropForeignKey
ALTER TABLE "CvAdaptation" DROP CONSTRAINT "CvAdaptation_userId_fkey";

-- DropIndex
DROP INDEX "Resume_userId_isPrimary_idx";

-- DropIndex
DROP INDEX "Resume_userId_primaryResumeSlot_key";

-- AlterTable
ALTER TABLE "Resume" DROP COLUMN "isPrimary",
DROP COLUMN "primaryResumeSlot";

-- AddForeignKey
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_masterResumeId_fkey" FOREIGN KEY ("masterResumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ResumeTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_adaptedResumeId_fkey" FOREIGN KEY ("adaptedResumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
