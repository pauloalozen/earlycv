-- AlterEnum
ALTER TYPE "DiscoveredCompanyStatus" ADD VALUE 'NO_TECH_JOBS';

-- AlterTable
ALTER TABLE "DiscoveredCompany" ADD COLUMN     "rawJobCount" INTEGER NOT NULL DEFAULT 0;
