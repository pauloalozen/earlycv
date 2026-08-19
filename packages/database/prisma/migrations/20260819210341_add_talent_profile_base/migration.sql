-- CreateEnum
CREATE TYPE "TalentDataProvenance" AS ENUM ('EXTRACTED_REGEX', 'EXTRACTED_IA', 'DECLARED_BY_USER', 'OBSERVED_INTERACTION', 'DERIVED_AGGREGATE', 'MANUAL_ADMIN');

-- CreateEnum
CREATE TYPE "TalentIdentityConfidence" AS ENUM ('CONFIRMED_USER', 'STRONG_MATCH', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "TalentIdentitySignalType" AS ENUM ('USER_ID', 'EMAIL', 'PHONE', 'LINKEDIN', 'NAME_COMPOSITE');

-- CreateEnum
CREATE TYPE "TalentB2bExposureStatus" AS ENUM ('NOT_ELIGIBLE', 'OPT_IN_PENDING', 'OPT_IN_GRANTED', 'OPT_OUT');

-- CreateEnum
CREATE TYPE "TalentContactAuthorization" AS ENUM ('NOT_REQUESTED', 'GRANTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "TalentCompetencyCategory" AS ENUM ('TECHNICAL_SKILL', 'SOFT_SKILL', 'TOOL', 'METHODOLOGY', 'TECHNOLOGY');

-- CreateTable
CREATE TABLE "TalentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "identityConfidence" "TalentIdentityConfidence" NOT NULL DEFAULT 'UNVERIFIED',
    "fullName" TEXT,
    "primaryEmail" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "currentTitle" TEXT,
    "seniority" "SeniorityLevel",
    "yearsExperience" INTEGER,
    "primaryAreas" "JobArea"[],
    "completenessScore" INTEGER NOT NULL DEFAULT 0,
    "internalMatchingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "b2bExposureStatus" "TalentB2bExposureStatus" NOT NULL DEFAULT 'NOT_ELIGIBLE',
    "contactAuthorization" "TalentContactAuthorization" NOT NULL DEFAULT 'NOT_REQUESTED',
    "lastAnalysisAt" TIMESTAMP(3),
    "lastInteractionAt" TIMESTAMP(3),
    "lastEnrichedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentIdentitySignal" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "signalType" "TalentIdentitySignalType" NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "confidence" "TalentIdentityConfidence" NOT NULL,
    "provenance" "TalentDataProvenance" NOT NULL,
    "sourceRecordType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentIdentitySignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentIdentityConflict" (
    "id" TEXT NOT NULL,
    "profileAId" TEXT NOT NULL,
    "profileBId" TEXT NOT NULL,
    "signalType" "TalentIdentitySignalType" NOT NULL,
    "profileAValue" TEXT NOT NULL,
    "profileBValue" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "resolvedByAdminId" TEXT,

    CONSTRAINT "TalentIdentityConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentCompetency" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "category" "TalentCompetencyCategory" NOT NULL,
    "valueNormalized" TEXT NOT NULL,
    "valueLabel" TEXT NOT NULL,
    "proficiencyLevel" TEXT,
    "provenance" "TalentDataProvenance" NOT NULL,
    "sourceRecordType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "firstObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentLanguageSkill" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "proficiencyLevel" TEXT,
    "provenance" "TalentDataProvenance" NOT NULL,
    "sourceRecordType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentLanguageSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentCertification" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "issuer" TEXT,
    "year" INTEGER,
    "provenance" "TalentDataProvenance" NOT NULL,
    "sourceRecordType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentExperience" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyNormalized" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "roleNormalized" TEXT NOT NULL,
    "location" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "seniorityAtRole" "SeniorityLevel",
    "technologiesUsed" TEXT[],
    "bulletsJson" JSONB,
    "provenance" "TalentDataProvenance" NOT NULL,
    "sourceRecordType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentEducation" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT,
    "fieldOfStudy" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "provenance" "TalentDataProvenance" NOT NULL,
    "sourceRecordType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentEducation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentInteractionHistory" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "companyName" TEXT,
    "jobTitle" TEXT,
    "area" "JobArea",
    "seniority" "SeniorityLevel",
    "scoreBefore" INTEGER,
    "scoreAfter" INTEGER,
    "analyzedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentInteractionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TalentProfile_userId_key" ON "TalentProfile"("userId");

-- CreateIndex
CREATE INDEX "TalentProfile_identityConfidence_idx" ON "TalentProfile"("identityConfidence");

-- CreateIndex
CREATE INDEX "TalentProfile_lastInteractionAt_idx" ON "TalentProfile"("lastInteractionAt");

-- CreateIndex
CREATE INDEX "TalentProfile_b2bExposureStatus_idx" ON "TalentProfile"("b2bExposureStatus");

-- CreateIndex
CREATE INDEX "TalentProfile_seniority_idx" ON "TalentProfile"("seniority");

-- CreateIndex
CREATE INDEX "TalentProfile_city_state_idx" ON "TalentProfile"("city", "state");

-- CreateIndex
CREATE INDEX "TalentIdentitySignal_talentProfileId_idx" ON "TalentIdentitySignal"("talentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentIdentitySignal_signalType_normalizedValue_key" ON "TalentIdentitySignal"("signalType", "normalizedValue");

-- CreateIndex
CREATE INDEX "TalentIdentityConflict_resolvedAt_idx" ON "TalentIdentityConflict"("resolvedAt");

-- CreateIndex
CREATE INDEX "TalentCompetency_category_valueNormalized_idx" ON "TalentCompetency"("category", "valueNormalized");

-- CreateIndex
CREATE INDEX "TalentCompetency_talentProfileId_idx" ON "TalentCompetency"("talentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentCompetency_talentProfileId_category_valueNormalized_key" ON "TalentCompetency"("talentProfileId", "category", "valueNormalized");

-- CreateIndex
CREATE INDEX "TalentLanguageSkill_language_idx" ON "TalentLanguageSkill"("language");

-- CreateIndex
CREATE UNIQUE INDEX "TalentLanguageSkill_talentProfileId_language_key" ON "TalentLanguageSkill"("talentProfileId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "TalentCertification_talentProfileId_nameNormalized_key" ON "TalentCertification"("talentProfileId", "nameNormalized");

-- CreateIndex
CREATE INDEX "TalentExperience_talentProfileId_idx" ON "TalentExperience"("talentProfileId");

-- CreateIndex
CREATE INDEX "TalentExperience_companyNormalized_idx" ON "TalentExperience"("companyNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "TalentExperience_talentProfileId_sourceRecordType_sourceRec_key" ON "TalentExperience"("talentProfileId", "sourceRecordType", "sourceRecordId", "companyNormalized", "roleNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "TalentEducation_talentProfileId_sourceRecordType_sourceReco_key" ON "TalentEducation"("talentProfileId", "sourceRecordType", "sourceRecordId");

-- CreateIndex
CREATE INDEX "TalentInteractionHistory_talentProfileId_analyzedAt_idx" ON "TalentInteractionHistory"("talentProfileId", "analyzedAt");

-- CreateIndex
CREATE INDEX "TalentInteractionHistory_companyName_idx" ON "TalentInteractionHistory"("companyName");

-- CreateIndex
CREATE UNIQUE INDEX "TalentInteractionHistory_sourceType_sourceRecordId_key" ON "TalentInteractionHistory"("sourceType", "sourceRecordId");

-- AddForeignKey
ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentIdentitySignal" ADD CONSTRAINT "TalentIdentitySignal_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentIdentityConflict" ADD CONSTRAINT "TalentIdentityConflict_profileAId_fkey" FOREIGN KEY ("profileAId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentIdentityConflict" ADD CONSTRAINT "TalentIdentityConflict_profileBId_fkey" FOREIGN KEY ("profileBId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentCompetency" ADD CONSTRAINT "TalentCompetency_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentLanguageSkill" ADD CONSTRAINT "TalentLanguageSkill_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentCertification" ADD CONSTRAINT "TalentCertification_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentExperience" ADD CONSTRAINT "TalentExperience_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentEducation" ADD CONSTRAINT "TalentEducation_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentInteractionHistory" ADD CONSTRAINT "TalentInteractionHistory_talentProfileId_fkey" FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
