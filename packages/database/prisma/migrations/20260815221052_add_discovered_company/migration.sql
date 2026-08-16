-- CreateEnum
CREATE TYPE "DiscoveredCompanyStatus" AS ENUM ('PENDING', 'VALIDATED', 'NO_ACTIVE_JOBS', 'INVALID', 'IMPORTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "DiscoveredCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "industry" TEXT,
    "websiteUrl" TEXT,
    "careersUrl" TEXT,
    "adapterType" "JobSourceType",
    "status" "DiscoveredCompanyStatus" NOT NULL DEFAULT 'PENDING',
    "jobCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "checkedAt" TIMESTAMP(3),
    "linkedCompanyId" TEXT,
    "batchLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveredCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveredCompany_normalizedName_key" ON "DiscoveredCompany"("normalizedName");

-- CreateIndex
CREATE INDEX "DiscoveredCompany_status_idx" ON "DiscoveredCompany"("status");

-- CreateIndex
CREATE INDEX "DiscoveredCompany_linkedCompanyId_idx" ON "DiscoveredCompany"("linkedCompanyId");

-- AddForeignKey
ALTER TABLE "DiscoveredCompany" ADD CONSTRAINT "DiscoveredCompany_linkedCompanyId_fkey" FOREIGN KEY ("linkedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
