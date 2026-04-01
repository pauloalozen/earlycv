-- CreateEnum
CREATE TYPE "InternalRole" AS ENUM ('none', 'admin', 'superadmin');

-- CreateEnum
CREATE TYPE "ResumeKind" AS ENUM ('master', 'adapted');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "internalRole" "InternalRole" NOT NULL DEFAULT 'none',
ADD COLUMN "isStaff" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Resume"
ADD COLUMN "kind" "ResumeKind" NOT NULL DEFAULT 'master',
ADD COLUMN "isMaster" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "basedOnResumeId" TEXT,
ADD COLUMN "templateId" TEXT,
ADD COLUMN "targetJobId" TEXT,
ADD COLUMN "targetJobTitle" TEXT;

-- AddConstraint
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_master_kind_consistency_check"
CHECK (NOT "isMaster" OR "kind" = 'master');

-- AddConstraint
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_adapted_requires_context_check"
CHECK (
    "kind" <> 'adapted'
    OR "basedOnResumeId" IS NOT NULL
    OR "templateId" IS NOT NULL
    OR "targetJobId" IS NOT NULL
    OR "targetJobTitle" IS NOT NULL
);

-- CreateTable
CREATE TABLE "ResumeTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "targetRole" TEXT,
    "fileUrl" TEXT,
    "structureJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResumeTemplate_slug_key" ON "ResumeTemplate"("slug");

-- CreateIndex
CREATE INDEX "Resume_basedOnResumeId_idx" ON "Resume"("basedOnResumeId");

-- CreateIndex
CREATE INDEX "Resume_templateId_idx" ON "Resume"("templateId");

-- CreateIndex
CREATE INDEX "Resume_targetJobId_idx" ON "Resume"("targetJobId");

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_basedOnResumeId_fkey" FOREIGN KEY ("basedOnResumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ResumeTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
