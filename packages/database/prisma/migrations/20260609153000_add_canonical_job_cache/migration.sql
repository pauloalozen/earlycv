CREATE TABLE "CanonicalJob" (
    "id" TEXT NOT NULL,
    "canonicalJobHash" TEXT NOT NULL,
    "requirementSourceHash" TEXT NOT NULL,
    "canonicalJobJson" JSONB NOT NULL,
    "canonicalizationModel" TEXT NOT NULL,
    "canonicalizationPromptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobRawInput" (
    "id" TEXT NOT NULL,
    "rawJobHash" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "normalizedRawText" TEXT NOT NULL,
    "canonicalJobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRawInput_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CvAdaptation"
ADD COLUMN "canonicalJobId" TEXT;

CREATE UNIQUE INDEX "CanonicalJob_canonicalJobHash_key" ON "CanonicalJob"("canonicalJobHash");
CREATE INDEX "CanonicalJob_requirementSourceHash_idx" ON "CanonicalJob"("requirementSourceHash");
CREATE UNIQUE INDEX "JobRawInput_rawJobHash_key" ON "JobRawInput"("rawJobHash");
CREATE INDEX "JobRawInput_canonicalJobId_createdAt_idx" ON "JobRawInput"("canonicalJobId", "createdAt");
CREATE INDEX "CvAdaptation_canonicalJobId_idx" ON "CvAdaptation"("canonicalJobId");

ALTER TABLE "JobRawInput" ADD CONSTRAINT "JobRawInput_canonicalJobId_fkey"
FOREIGN KEY ("canonicalJobId") REFERENCES "CanonicalJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_canonicalJobId_fkey"
FOREIGN KEY ("canonicalJobId") REFERENCES "CanonicalJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
