-- CreateEnum
CREATE TYPE "AnalysisCvSourceType" AS ENUM ('text_input', 'uploaded_file', 'master_resume');

-- CreateTable
CREATE TABLE "AnalysisCvSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestSessionHash" TEXT,
    "sourceType" "AnalysisCvSourceType" NOT NULL,
    "textStorageKey" TEXT NOT NULL,
    "textSha256" TEXT NOT NULL,
    "textSizeBytes" INTEGER NOT NULL,
    "originalFileStorageKey" TEXT,
    "originalFileSha256" TEXT,
    "originalFileName" TEXT,
    "originalMimeType" TEXT,
    "originalFileSizeBytes" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "claimedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisCvSnapshot_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CvAdaptation" ADD COLUMN     "analysisCvSnapshotId" TEXT;

-- CreateIndex
CREATE INDEX "AnalysisCvSnapshot_userId_idx" ON "AnalysisCvSnapshot"("userId");

-- CreateIndex
CREATE INDEX "AnalysisCvSnapshot_guestSessionHash_idx" ON "AnalysisCvSnapshot"("guestSessionHash");

-- CreateIndex
CREATE INDEX "AnalysisCvSnapshot_expiresAt_idx" ON "AnalysisCvSnapshot"("expiresAt");

-- CreateIndex
CREATE INDEX "AnalysisCvSnapshot_textSha256_idx" ON "AnalysisCvSnapshot"("textSha256");

-- CreateIndex
CREATE UNIQUE INDEX "CvAdaptation_analysisCvSnapshotId_key" ON "CvAdaptation"("analysisCvSnapshotId");

-- CreateIndex
CREATE INDEX "CvAdaptation_analysisCvSnapshotId_idx" ON "CvAdaptation"("analysisCvSnapshotId");

-- AddForeignKey
ALTER TABLE "AnalysisCvSnapshot" ADD CONSTRAINT "AnalysisCvSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisCvSnapshot" ADD CONSTRAINT "AnalysisCvSnapshot_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_analysisCvSnapshotId_fkey" FOREIGN KEY ("analysisCvSnapshotId") REFERENCES "AnalysisCvSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
