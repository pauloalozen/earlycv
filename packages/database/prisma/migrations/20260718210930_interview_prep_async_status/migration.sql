-- CreateEnum
CREATE TYPE "InterviewPrepStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed');

-- AlterTable
ALTER TABLE "JobApplicationInterviewPrep" ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" "InterviewPrepStatus" NOT NULL DEFAULT 'pending',
ALTER COLUMN "generatedContentJson" DROP NOT NULL,
ALTER COLUMN "generatedAt" DROP NOT NULL,
ALTER COLUMN "generatedAt" DROP DEFAULT;
