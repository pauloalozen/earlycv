-- CreateEnum
CREATE TYPE "MasterCvCanonicalExtractionStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "MasterCvCanonicalExtraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" "MasterCvCanonicalExtractionStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "canonicalJson" JSONB,
    "coverageJson" JSONB,
    "confidenceJson" JSONB,
    "evidenceJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterCvCanonicalExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasterCvCanonicalExtraction_resumeId_inputHash_key" ON "MasterCvCanonicalExtraction"("resumeId", "inputHash");

-- CreateIndex
CREATE INDEX "MasterCvCanonicalExtraction_userId_createdAt_idx" ON "MasterCvCanonicalExtraction"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MasterCvCanonicalExtraction_status_updatedAt_idx" ON "MasterCvCanonicalExtraction"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "MasterCvCanonicalExtraction" ADD CONSTRAINT "MasterCvCanonicalExtraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCvCanonicalExtraction" ADD CONSTRAINT "MasterCvCanonicalExtraction_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
