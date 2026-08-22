-- CreateTable
CREATE TABLE "JobSourceAudit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobSourceId" TEXT,
    "field" TEXT NOT NULL,
    "currentUrl" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "suspectedOwnerId" TEXT,
    "suspectedOwnerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "JobSourceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobSourceAudit_status_idx" ON "JobSourceAudit"("status");

-- CreateIndex
CREATE INDEX "JobSourceAudit_tier_idx" ON "JobSourceAudit"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "JobSourceAudit_companyId_field_currentUrl_key" ON "JobSourceAudit"("companyId", "field", "currentUrl");

-- AddForeignKey
ALTER TABLE "JobSourceAudit" ADD CONSTRAINT "JobSourceAudit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSourceAudit" ADD CONSTRAINT "JobSourceAudit_jobSourceId_fkey" FOREIGN KEY ("jobSourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSourceAudit" ADD CONSTRAINT "JobSourceAudit_suspectedOwnerId_fkey" FOREIGN KEY ("suspectedOwnerId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
