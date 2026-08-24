-- AlterTable
ALTER TABLE "AnalysisJob" ADD COLUMN     "guestPossessionTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisJob_guestPossessionTokenHash_key" ON "AnalysisJob"("guestPossessionTokenHash");
