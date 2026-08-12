-- AlterTable
ALTER TABLE "Job" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Job_slug_key" ON "Job"("slug");

-- CreateIndex
CREATE INDEX "Job_slug_idx" ON "Job"("slug");
