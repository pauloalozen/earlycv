-- CreateEnum
CREATE TYPE "CoverLetterStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "CoverLetterStyle" AS ENUM ('formal', 'moderno', 'executivo', 'primeiro_emprego');

-- CreateEnum
CREATE TYPE "CoverLetterLengthMode" AS ENUM ('curta', 'media', 'completa', 'custom');

-- AlterEnum
ALTER TYPE "JobApplicationEventType" ADD VALUE 'COVER_LETTER_GENERATED';

-- AlterTable
ALTER TABLE "CvAdaptation" ADD COLUMN     "language" TEXT;

-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "language" TEXT;

-- CreateTable
CREATE TABLE "JobApplicationCoverLetter" (
    "id" TEXT NOT NULL,
    "jobApplicationId" TEXT NOT NULL,
    "cvAdaptationId" TEXT,
    "status" "CoverLetterStatus" NOT NULL DEFAULT 'pending',
    "style" "CoverLetterStyle" NOT NULL,
    "lengthMode" "CoverLetterLengthMode" NOT NULL,
    "maxCharacters" INTEGER,
    "generatedContentJson" JSONB,
    "lastError" TEXT,
    "generatedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplicationCoverLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobApplicationCoverLetter_jobApplicationId_key" ON "JobApplicationCoverLetter"("jobApplicationId");

-- AddForeignKey
ALTER TABLE "JobApplicationCoverLetter" ADD CONSTRAINT "JobApplicationCoverLetter_jobApplicationId_fkey" FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
