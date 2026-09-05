-- CreateEnum
CREATE TYPE "CvSourceOwnerType" AS ENUM ('USER', 'GUEST');

-- CreateEnum
CREATE TYPE "CvSubmissionOrigin" AS ENUM ('FILE_UPLOAD', 'PASTED_TEXT', 'CLAIM');

-- CreateEnum
CREATE TYPE "CvStructuredProfileStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CvProcessingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CvProcessingMasterIntent" AS ENUM ('NONE', 'PROMOTE_IF_FIRST', 'PROMOTE_EXPLICIT');

-- CreateEnum
CREATE TYPE "CvMasterPromotionReason" AS ENUM ('FIRST_EVER', 'EXPLICIT_FLAG', 'CLAIM_PROMOTION');

-- CreateEnum
CREATE TYPE "TalentSubjectMergeReason" AS ENUM ('STRONG_SIGNAL_MATCH', 'CLAIM_FULL', 'CLAIM_PARTIAL_COPY', 'MANUAL_ADMIN_REVIEW');

-- CreateEnum
CREATE TYPE "MonitorProjectionJobReason" AS ENUM ('MASTER_CREATED', 'MASTER_REPLACED', 'MASTER_REMOVED', 'PREFERENCES_CHANGED');

-- CreateEnum
CREATE TYPE "MonitorProjectionJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "AnalysisCvSnapshot" ADD COLUMN     "cvStructuredProfileId" TEXT,
ADD COLUMN     "cvSubmissionId" TEXT;

-- AlterTable
ALTER TABLE "AnalysisJob" ADD COLUMN     "cvProcessingJobId" TEXT,
ADD COLUMN     "cvStructuredProfileId" TEXT,
ADD COLUMN     "cvSubmissionId" TEXT;

-- AlterTable
ALTER TABLE "CvAdaptation" ADD COLUMN     "cvStructuredProfileId" TEXT;

-- AlterTable
ALTER TABLE "Resume" ADD COLUMN     "cvSourceId" TEXT,
ADD COLUMN     "cvSubmissionId" TEXT;

-- AlterTable
ALTER TABLE "TalentProfile" ADD COLUMN     "mergedIntoTalentProfileId" TEXT,
ADD COLUMN     "talentSubjectId" TEXT;

-- CreateTable
CREATE TABLE "CvSource" (
    "id" TEXT NOT NULL,
    "ownerType" "CvSourceOwnerType" NOT NULL,
    "userId" TEXT,
    "talentSubjectId" TEXT,
    "textStorageKey" TEXT NOT NULL,
    "textSha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CvSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvSubmission" (
    "id" TEXT NOT NULL,
    "cvSourceId" TEXT NOT NULL,
    "origin" "CvSubmissionOrigin" NOT NULL,
    "fileStorageKey" TEXT,
    "fileSha256" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CvSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvStructuredProfile" (
    "id" TEXT NOT NULL,
    "cvSourceId" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "status" "CvStructuredProfileStatus" NOT NULL DEFAULT 'PENDING',
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

    CONSTRAINT "CvStructuredProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvProcessingJob" (
    "id" TEXT NOT NULL,
    "cvSourceId" TEXT NOT NULL,
    "cvSubmissionId" TEXT NOT NULL,
    "masterIntent" "CvProcessingMasterIntent" NOT NULL DEFAULT 'NONE',
    "status" "CvProcessingJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "workerId" TEXT,
    "lastError" TEXT,
    "cvStructuredProfileId" TEXT,
    "masterDesignationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CvProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvMasterDesignation" (
    "id" TEXT NOT NULL,
    "ownerType" "CvSourceOwnerType" NOT NULL,
    "userId" TEXT,
    "talentSubjectId" TEXT,
    "cvStructuredProfileId" TEXT NOT NULL,
    "resumeId" TEXT,
    "promotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedReason" "CvMasterPromotionReason" NOT NULL,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "CvMasterDesignation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentSubject" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mergedIntoUserId" TEXT,
    "mergedIntoTalentProfileId" TEXT,
    "mergedAt" TIMESTAMP(3),

    CONSTRAINT "TalentSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentSubjectSessionSignal" (
    "id" TEXT NOT NULL,
    "talentSubjectId" TEXT NOT NULL,
    "guestSessionHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentSubjectSessionSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentProfileSource" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "cvSourceId" TEXT NOT NULL,
    "contributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentProfileSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentSubjectMergeEvent" (
    "id" TEXT NOT NULL,
    "talentSubjectId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetTalentSubjectId" TEXT,
    "reason" "TalentSubjectMergeReason" NOT NULL,
    "triggeringAnalysisJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentSubjectMergeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimSourceGrant" (
    "id" TEXT NOT NULL,
    "cvSourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provenByAnalysisJobId" TEXT NOT NULL,

    CONSTRAINT "ClaimSourceGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvSourceEquivalence" (
    "id" TEXT NOT NULL,
    "primaryCvSourceId" TEXT NOT NULL,
    "equivalentCvSourceId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CvSourceEquivalence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentEducationObservation" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "cvStructuredProfileId" TEXT NOT NULL,
    "itemFingerprint" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "institutionRaw" TEXT NOT NULL,
    "degreeRaw" TEXT,
    "fieldOfStudyRaw" TEXT,
    "periodRaw" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentEducationObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentCompetencyObservation" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "cvStructuredProfileId" TEXT NOT NULL,
    "category" "TalentCompetencyCategory" NOT NULL,
    "itemFingerprint" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "valueRaw" TEXT NOT NULL,
    "proficiencyLevelRaw" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentCompetencyObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentLanguageObservation" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "cvStructuredProfileId" TEXT NOT NULL,
    "itemFingerprint" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "languageRaw" TEXT NOT NULL,
    "proficiencyLevelRaw" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentLanguageObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentCertificationObservation" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "cvStructuredProfileId" TEXT NOT NULL,
    "itemFingerprint" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "nameRaw" TEXT NOT NULL,
    "issuerRaw" TEXT,
    "yearRaw" INTEGER,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentCertificationObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorProjectionJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "MonitorProjectionJobReason" NOT NULL,
    "status" "MonitorProjectionJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MonitorProjectionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CvSource_userId_idx" ON "CvSource"("userId");

-- CreateIndex
CREATE INDEX "CvSource_talentSubjectId_idx" ON "CvSource"("talentSubjectId");

-- CreateIndex
CREATE UNIQUE INDEX "CvSource_userId_textSha256_key" ON "CvSource"("userId", "textSha256");

-- CreateIndex
CREATE UNIQUE INDEX "CvSource_talentSubjectId_textSha256_key" ON "CvSource"("talentSubjectId", "textSha256");

-- CreateIndex
CREATE INDEX "CvSubmission_cvSourceId_idx" ON "CvSubmission"("cvSourceId");

-- CreateIndex
CREATE INDEX "CvStructuredProfile_status_idx" ON "CvStructuredProfile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CvStructuredProfile_cvSourceId_extractorVersion_schemaVersi_key" ON "CvStructuredProfile"("cvSourceId", "extractorVersion", "schemaVersion");

-- CreateIndex
CREATE INDEX "CvProcessingJob_status_idx" ON "CvProcessingJob"("status");

-- CreateIndex
CREATE INDEX "CvProcessingJob_cvSourceId_idx" ON "CvProcessingJob"("cvSourceId");

-- CreateIndex
CREATE INDEX "CvMasterDesignation_userId_idx" ON "CvMasterDesignation"("userId");

-- CreateIndex
CREATE INDEX "CvMasterDesignation_talentSubjectId_idx" ON "CvMasterDesignation"("talentSubjectId");

-- CreateIndex
CREATE INDEX "TalentSubject_mergedIntoUserId_idx" ON "TalentSubject"("mergedIntoUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentSubjectSessionSignal_guestSessionHash_key" ON "TalentSubjectSessionSignal"("guestSessionHash");

-- CreateIndex
CREATE INDEX "TalentSubjectSessionSignal_talentSubjectId_idx" ON "TalentSubjectSessionSignal"("talentSubjectId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentProfileSource_talentProfileId_cvSourceId_key" ON "TalentProfileSource"("talentProfileId", "cvSourceId");

-- CreateIndex
CREATE INDEX "TalentSubjectMergeEvent_talentSubjectId_idx" ON "TalentSubjectMergeEvent"("talentSubjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimSourceGrant_cvSourceId_userId_key" ON "ClaimSourceGrant"("cvSourceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CvSourceEquivalence_primaryCvSourceId_equivalentCvSourceId_key" ON "CvSourceEquivalence"("primaryCvSourceId", "equivalentCvSourceId");

-- CreateIndex
CREATE INDEX "TalentEducationObservation_talentProfileId_idx" ON "TalentEducationObservation"("talentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentEducationObservation_talentProfileId_cvStructuredProf_key" ON "TalentEducationObservation"("talentProfileId", "cvStructuredProfileId", "itemFingerprint", "itemIndex");

-- CreateIndex
CREATE INDEX "TalentCompetencyObservation_talentProfileId_category_idx" ON "TalentCompetencyObservation"("talentProfileId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "TalentCompetencyObservation_talentProfileId_cvStructuredPro_key" ON "TalentCompetencyObservation"("talentProfileId", "cvStructuredProfileId", "itemFingerprint", "itemIndex");

-- CreateIndex
CREATE INDEX "TalentLanguageObservation_talentProfileId_idx" ON "TalentLanguageObservation"("talentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentLanguageObservation_talentProfileId_cvStructuredProfi_key" ON "TalentLanguageObservation"("talentProfileId", "cvStructuredProfileId", "itemFingerprint", "itemIndex");

-- CreateIndex
CREATE INDEX "TalentCertificationObservation_talentProfileId_idx" ON "TalentCertificationObservation"("talentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentCertificationObservation_talentProfileId_cvStructured_key" ON "TalentCertificationObservation"("talentProfileId", "cvStructuredProfileId", "itemFingerprint", "itemIndex");

-- CreateIndex
CREATE INDEX "MonitorProjectionJob_userId_idx" ON "MonitorProjectionJob"("userId");

-- CreateIndex
CREATE INDEX "MonitorProjectionJob_status_idx" ON "MonitorProjectionJob"("status");

-- CreateIndex
CREATE INDEX "AnalysisCvSnapshot_cvSubmissionId_idx" ON "AnalysisCvSnapshot"("cvSubmissionId");

-- CreateIndex
CREATE INDEX "AnalysisCvSnapshot_cvStructuredProfileId_idx" ON "AnalysisCvSnapshot"("cvStructuredProfileId");

-- CreateIndex
CREATE INDEX "AnalysisJob_cvProcessingJobId_idx" ON "AnalysisJob"("cvProcessingJobId");

-- CreateIndex
CREATE INDEX "AnalysisJob_cvSubmissionId_idx" ON "AnalysisJob"("cvSubmissionId");

-- CreateIndex
CREATE INDEX "AnalysisJob_cvStructuredProfileId_idx" ON "AnalysisJob"("cvStructuredProfileId");

-- CreateIndex
CREATE INDEX "CvAdaptation_cvStructuredProfileId_idx" ON "CvAdaptation"("cvStructuredProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Resume_cvSubmissionId_key" ON "Resume"("cvSubmissionId");

-- CreateIndex
CREATE INDEX "Resume_cvSourceId_idx" ON "Resume"("cvSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentProfile_talentSubjectId_key" ON "TalentProfile"("talentSubjectId");

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_cvSourceId_fkey" FOREIGN KEY ("cvSourceId") REFERENCES "CvSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_cvSubmissionId_fkey" FOREIGN KEY ("cvSubmissionId") REFERENCES "CvSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_cvStructuredProfileId_fkey" FOREIGN KEY ("cvStructuredProfileId") REFERENCES "CvStructuredProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisCvSnapshot" ADD CONSTRAINT "AnalysisCvSnapshot_cvSubmissionId_fkey" FOREIGN KEY ("cvSubmissionId") REFERENCES "CvSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisCvSnapshot" ADD CONSTRAINT "AnalysisCvSnapshot_cvStructuredProfileId_fkey" FOREIGN KEY ("cvStructuredProfileId") REFERENCES "CvStructuredProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_cvProcessingJobId_fkey" FOREIGN KEY ("cvProcessingJobId") REFERENCES "CvProcessingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_cvSubmissionId_fkey" FOREIGN KEY ("cvSubmissionId") REFERENCES "CvSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_cvStructuredProfileId_fkey" FOREIGN KEY ("cvStructuredProfileId") REFERENCES "CvStructuredProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_talentSubjectId_fkey" FOREIGN KEY ("talentSubjectId") REFERENCES "TalentSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvSource" ADD CONSTRAINT "CvSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvSource" ADD CONSTRAINT "CvSource_talentSubjectId_fkey" FOREIGN KEY ("talentSubjectId") REFERENCES "TalentSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvSubmission" ADD CONSTRAINT "CvSubmission_cvSourceId_fkey" FOREIGN KEY ("cvSourceId") REFERENCES "CvSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvStructuredProfile" ADD CONSTRAINT "CvStructuredProfile_cvSourceId_fkey" FOREIGN KEY ("cvSourceId") REFERENCES "CvSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvProcessingJob" ADD CONSTRAINT "CvProcessingJob_cvSourceId_fkey" FOREIGN KEY ("cvSourceId") REFERENCES "CvSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvProcessingJob" ADD CONSTRAINT "CvProcessingJob_cvSubmissionId_fkey" FOREIGN KEY ("cvSubmissionId") REFERENCES "CvSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvMasterDesignation" ADD CONSTRAINT "CvMasterDesignation_cvStructuredProfileId_fkey" FOREIGN KEY ("cvStructuredProfileId") REFERENCES "CvStructuredProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvMasterDesignation" ADD CONSTRAINT "CvMasterDesignation_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentSubjectSessionSignal" ADD CONSTRAINT "TalentSubjectSessionSignal_talentSubjectId_fkey" FOREIGN KEY ("talentSubjectId") REFERENCES "TalentSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentProfileSource" ADD CONSTRAINT "TalentProfileSource_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentProfileSource" ADD CONSTRAINT "TalentProfileSource_cvSourceId_fkey" FOREIGN KEY ("cvSourceId") REFERENCES "CvSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimSourceGrant" ADD CONSTRAINT "ClaimSourceGrant_cvSourceId_fkey" FOREIGN KEY ("cvSourceId") REFERENCES "CvSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimSourceGrant" ADD CONSTRAINT "ClaimSourceGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvSourceEquivalence" ADD CONSTRAINT "CvSourceEquivalence_primaryCvSourceId_fkey" FOREIGN KEY ("primaryCvSourceId") REFERENCES "CvSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvSourceEquivalence" ADD CONSTRAINT "CvSourceEquivalence_equivalentCvSourceId_fkey" FOREIGN KEY ("equivalentCvSourceId") REFERENCES "CvSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentEducationObservation" ADD CONSTRAINT "TalentEducationObservation_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentEducationObservation" ADD CONSTRAINT "TalentEducationObservation_cvStructuredProfileId_fkey" FOREIGN KEY ("cvStructuredProfileId") REFERENCES "CvStructuredProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentCompetencyObservation" ADD CONSTRAINT "TalentCompetencyObservation_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentCompetencyObservation" ADD CONSTRAINT "TalentCompetencyObservation_cvStructuredProfileId_fkey" FOREIGN KEY ("cvStructuredProfileId") REFERENCES "CvStructuredProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentLanguageObservation" ADD CONSTRAINT "TalentLanguageObservation_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentLanguageObservation" ADD CONSTRAINT "TalentLanguageObservation_cvStructuredProfileId_fkey" FOREIGN KEY ("cvStructuredProfileId") REFERENCES "CvStructuredProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentCertificationObservation" ADD CONSTRAINT "TalentCertificationObservation_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentCertificationObservation" ADD CONSTRAINT "TalentCertificationObservation_cvStructuredProfileId_fkey" FOREIGN KEY ("cvStructuredProfileId") REFERENCES "CvStructuredProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Integridade de propriedade (plano v3, seção 7)
-- =============================================================================

ALTER TABLE "CvSource" ADD CONSTRAINT "cv_source_owner_xor" CHECK (
  ("ownerType" = 'USER' AND "userId" IS NOT NULL AND "talentSubjectId" IS NULL) OR
  ("ownerType" = 'GUEST' AND "talentSubjectId" IS NOT NULL AND "userId" IS NULL)
);

ALTER TABLE "CvMasterDesignation" ADD CONSTRAINT "cv_master_designation_owner_xor" CHECK (
  ("ownerType" = 'USER' AND "userId" IS NOT NULL AND "talentSubjectId" IS NULL) OR
  ("ownerType" = 'GUEST' AND "talentSubjectId" IS NOT NULL AND "userId" IS NULL)
);

ALTER TABLE "TalentProfile" ADD CONSTRAINT "talent_profile_owner_xor" CHECK (
  ("userId" IS NOT NULL AND "talentSubjectId" IS NULL) OR
  ("userId" IS NULL AND "talentSubjectId" IS NOT NULL) OR
  ("userId" IS NULL AND "talentSubjectId" IS NULL) -- linhas legadas pré-migração, sem nenhum dos dois ainda
);

-- Trigger: uma CvMasterDesignation de USUÁRIO pode apontar pra um
-- CvStructuredProfile cujo CvSource pertence DIRETAMENTE ao usuário, OU a
-- uma fonte guest pra qual o usuário possui ClaimSourceGrant válido. Uma
-- designação de GUEST só pode apontar pra fonte do próprio talentSubject.
CREATE OR REPLACE FUNCTION check_master_designation_subject_match() RETURNS trigger AS $$
DECLARE
  source_user_id TEXT;
  source_subject_id TEXT;
  source_cv_id TEXT;
  has_grant BOOLEAN;
BEGIN
  SELECT cs."userId", cs."talentSubjectId", cs.id
    INTO source_user_id, source_subject_id, source_cv_id
    FROM "CvStructuredProfile" sp
    JOIN "CvSource" cs ON cs.id = sp."cvSourceId"
    WHERE sp.id = NEW."cvStructuredProfileId";

  IF NEW."userId" IS NOT NULL THEN
    IF NEW."userId" = source_user_id THEN
      RETURN NEW;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM "ClaimSourceGrant" g
      WHERE g."cvSourceId" = source_cv_id AND g."userId" = NEW."userId"
    ) INTO has_grant;

    IF NOT has_grant THEN
      RAISE EXCEPTION 'CvMasterDesignation subject mismatch: user has neither ownership nor grant over the source';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW."talentSubjectId" IS NOT NULL AND NEW."talentSubjectId" != source_subject_id THEN
    RAISE EXCEPTION 'CvMasterDesignation subject mismatch (guest subject)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "trg_master_designation_subject_match"
  AFTER INSERT OR UPDATE ON "CvMasterDesignation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_master_designation_subject_match();

-- =============================================================================
-- Imutabilidade de CvStructuredProfile após READY (plano v3, seção 9)
-- =============================================================================

CREATE OR REPLACE FUNCTION reject_ready_profile_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'READY' AND (
    NEW."canonicalJson" IS DISTINCT FROM OLD."canonicalJson" OR
    NEW."coverageJson" IS DISTINCT FROM OLD."coverageJson" OR
    NEW."confidenceJson" IS DISTINCT FROM OLD."confidenceJson" OR
    NEW."evidenceJson" IS DISTINCT FROM OLD."evidenceJson" OR
    NEW."extractorVersion" IS DISTINCT FROM OLD."extractorVersion" OR
    NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion" OR
    NEW."cvSourceId" IS DISTINCT FROM OLD."cvSourceId"
  ) THEN
    RAISE EXCEPTION 'CvStructuredProfile is immutable once READY';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_reject_ready_profile_mutation"
  BEFORE UPDATE ON "CvStructuredProfile"
  FOR EACH ROW EXECUTE FUNCTION reject_ready_profile_mutation();

-- =============================================================================
-- Concorrência de promoção de Master (plano v3, seção 10) — só uma
-- CvMasterDesignation ativa (supersededAt IS NULL) por dono.
-- =============================================================================

CREATE UNIQUE INDEX "cv_master_designation_active_user"
  ON "CvMasterDesignation" ("userId")
  WHERE "supersededAt" IS NULL AND "userId" IS NOT NULL;

CREATE UNIQUE INDEX "cv_master_designation_active_guest"
  ON "CvMasterDesignation" ("talentSubjectId")
  WHERE "supersededAt" IS NULL AND "talentSubjectId" IS NOT NULL;

-- Mesma técnica pro bug já existente de dois Resume.isMaster=true
-- coexistirem pro mesmo usuário (achado da auditoria original).
CREATE UNIQUE INDEX "resume_one_master_per_user"
  ON "Resume" ("userId")
  WHERE "isMaster" = true;

