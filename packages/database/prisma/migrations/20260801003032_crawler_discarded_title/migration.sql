-- CreateTable
CREATE TABLE "CrawlerDiscardedTitle" (
    "id" TEXT NOT NULL,
    "jobSourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "externalJobId" TEXT,
    "canonicalKey" TEXT NOT NULL,
    "filterReason" TEXT NOT NULL,
    "filterVersion" TEXT NOT NULL,
    "discardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "whitelistedAt" TIMESTAMP(3),

    CONSTRAINT "CrawlerDiscardedTitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrawlerDiscardedTitle_jobSourceId_idx" ON "CrawlerDiscardedTitle"("jobSourceId");

-- CreateIndex
CREATE INDEX "CrawlerDiscardedTitle_filterReason_idx" ON "CrawlerDiscardedTitle"("filterReason");

-- CreateIndex
CREATE INDEX "CrawlerDiscardedTitle_discardedAt_idx" ON "CrawlerDiscardedTitle"("discardedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrawlerDiscardedTitle_canonicalKey_key" ON "CrawlerDiscardedTitle"("canonicalKey");

-- AddForeignKey
ALTER TABLE "CrawlerDiscardedTitle" ADD CONSTRAINT "CrawlerDiscardedTitle_jobSourceId_fkey" FOREIGN KEY ("jobSourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
