CREATE TABLE "JobRequirementSet" (
    "id" TEXT NOT NULL,
    "requirementSourceHash" TEXT NOT NULL,
    "canonicalJobId" TEXT NOT NULL,
    "requirementsJson" JSONB NOT NULL,
    "analysisModel" TEXT NOT NULL,
    "analysisPromptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRequirementSet_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CvAdaptation"
ADD COLUMN "jobRequirementSetId" TEXT;

CREATE UNIQUE INDEX "JobRequirementSet_requirementSourceHash_key"
ON "JobRequirementSet"("requirementSourceHash");

CREATE INDEX "JobRequirementSet_canonicalJobId_idx"
ON "JobRequirementSet"("canonicalJobId");

ALTER TABLE "JobRequirementSet"
ADD CONSTRAINT "JobRequirementSet_canonicalJobId_fkey"
FOREIGN KEY ("canonicalJobId") REFERENCES "CanonicalJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CvAdaptation"
ADD CONSTRAINT "CvAdaptation_jobRequirementSetId_fkey"
FOREIGN KEY ("jobRequirementSetId") REFERENCES "JobRequirementSet"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
