-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_jobSourceId_fkey";

-- AlterTable
ALTER TABLE "Job" ALTER COLUMN "jobSourceId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_jobSourceId_fkey" FOREIGN KEY ("jobSourceId") REFERENCES "JobSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
