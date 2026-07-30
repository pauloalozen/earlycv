-- CreateEnum
CREATE TYPE "JobArea" AS ENUM ('DATA_AI', 'SOFTWARE_ENGINEERING', 'CLOUD_DEVOPS', 'CYBERSECURITY', 'PRODUCT', 'DESIGN_UX', 'QA_TEST', 'PROJECT_AGILE', 'ARCHITECTURE', 'LEADERSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "SeniorityLevel" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'STAFF', 'MANAGER', 'DIRECTOR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('CLT', 'PJ', 'BOTH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SemanticFilterResult" AS ENUM ('PENDING', 'ENRICH', 'SKIP');

-- CreateEnum
CREATE TYPE "AutoApplyStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'RATE_LIMITED');

-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "autoApplyAttemptedAt" TIMESTAMP(3),
ADD COLUMN     "autoApplyCompletedAt" TIMESTAMP(3),
ADD COLUMN     "autoApplyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoApplyResultJson" JSONB,
ADD COLUMN     "autoApplyStatus" "AutoApplyStatus",
ADD COLUMN     "externalApplicationId" TEXT,
ADD COLUMN     "externalApplicationUrl" TEXT,
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "matchScore" INTEGER,
ADD COLUMN     "matchSnapshotJson" JSONB,
ADD COLUMN     "resumeUsedId" TEXT;

-- CreateTable
CREATE TABLE "JobEnrichment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "dominantArea" "JobArea",
    "areas" "JobArea"[],
    "specialties" TEXT[],
    "seniority" "SeniorityLevel",
    "requiredSkills" TEXT[],
    "optionalSkills" TEXT[],
    "technologies" TEXT[],
    "contractType" "ContractType",
    "languageRequirements" TEXT[],
    "certifications" TEXT[],
    "experienceYearsMin" INTEGER,
    "managementRequired" BOOLEAN NOT NULL DEFAULT false,
    "travelRequired" BOOLEAN NOT NULL DEFAULT false,
    "careerFingerprint" TEXT[],
    "semanticFilterResult" "SemanticFilterResult" NOT NULL DEFAULT 'PENDING',
    "semanticFilterReason" TEXT,
    "semanticFilterVersion" TEXT,
    "enrichmentStatus" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "enrichmentVersion" TEXT,
    "enrichmentModel" TEXT,
    "enrichmentError" TEXT,
    "enrichedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemanticFilterConfig" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "techSignals" TEXT[],
    "noiseSignals" TEXT[],
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SemanticFilterConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobEnrichment_jobId_key" ON "JobEnrichment"("jobId");

-- CreateIndex
CREATE INDEX "JobEnrichment_enrichmentStatus_idx" ON "JobEnrichment"("enrichmentStatus");

-- CreateIndex
CREATE INDEX "JobEnrichment_semanticFilterResult_idx" ON "JobEnrichment"("semanticFilterResult");

-- CreateIndex
CREATE INDEX "JobEnrichment_dominantArea_idx" ON "JobEnrichment"("dominantArea");

-- CreateIndex
CREATE INDEX "JobEnrichment_seniority_idx" ON "JobEnrichment"("seniority");

-- CreateIndex
CREATE UNIQUE INDEX "SemanticFilterConfig_version_key" ON "SemanticFilterConfig"("version");

-- CreateIndex
CREATE INDEX "JobApplication_jobId_idx" ON "JobApplication"("jobId");

-- CreateIndex
CREATE INDEX "JobApplication_resumeUsedId_idx" ON "JobApplication"("resumeUsedId");

-- AddForeignKey
ALTER TABLE "JobEnrichment" ADD CONSTRAINT "JobEnrichment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_resumeUsedId_fkey" FOREIGN KEY ("resumeUsedId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
