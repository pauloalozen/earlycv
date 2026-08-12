-- CreateTable
CREATE TABLE "GoogleIndexingLog" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleIndexingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleIndexingLog_createdAt_idx" ON "GoogleIndexingLog"("createdAt");
