-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "radarAreas" "JobArea"[],
ADD COLUMN     "radarSeniority" "SeniorityLevel";

-- CreateTable
CREATE TABLE "UserRadarProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "areas" "JobArea"[],
    "seniority" "SeniorityLevel" NOT NULL DEFAULT 'UNKNOWN',
    "skills" TEXT[],
    "technologies" TEXT[],
    "languages" TEXT[],
    "certifications" TEXT[],
    "careerFingerprint" TEXT[],
    "preferredWorkModels" TEXT[],
    "preferredContractTypes" "ContractType"[],
    "openToRelocation" BOOLEAN NOT NULL DEFAULT false,
    "salaryExpectationMin" INTEGER,
    "sourceResumeId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRadarProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserRadarProfile_userId_key" ON "UserRadarProfile"("userId");

-- CreateIndex
CREATE INDEX "UserRadarProfile_userId_idx" ON "UserRadarProfile"("userId");

-- AddForeignKey
ALTER TABLE "UserRadarProfile" ADD CONSTRAINT "UserRadarProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
