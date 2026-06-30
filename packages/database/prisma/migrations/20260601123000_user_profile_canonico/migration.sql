-- CreateEnum
CREATE TYPE "CvAdaptationSource" AS ENUM ('uploaded_content', 'user_profile');

-- CreateEnum
CREATE TYPE "CvAdaptationInputMode" AS ENUM ('file_upload', 'text_paste', 'profile');

-- CreateEnum
CREATE TYPE "ProfileReadinessStatus" AS ENUM ('empty', 'partial', 'ready');

-- AlterTable
ALTER TABLE "CvAdaptation"
ADD COLUMN "adaptationSource" "CvAdaptationSource" NOT NULL DEFAULT 'uploaded_content',
ADD COLUMN "inputMode" "CvAdaptationInputMode" NOT NULL DEFAULT 'file_upload',
ADD COLUMN "userProfileSnapshotJson" JSONB,
ADD COLUMN "uploadedContentSnapshotJson" JSONB,
ADD COLUMN "analysisInputSnapshotJson" JSONB,
ADD COLUMN "generationInputSnapshotJson" JSONB;

-- AlterTable
ALTER TABLE "UserProfile"
ADD COLUMN "fullName" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "linkedinUrl" TEXT,
ADD COLUMN "professionalSummary" TEXT,
ADD COLUMN "experiencesJson" JSONB,
ADD COLUMN "educationJson" JSONB,
ADD COLUMN "skillsJson" JSONB,
ADD COLUMN "languagesJson" JSONB,
ADD COLUMN "certificationsJson" JSONB,
ADD COLUMN "profileFieldMetaJson" JSONB,
ADD COLUMN "profileSuggestionsJson" JSONB,
ADD COLUMN "profileReadinessStatus" "ProfileReadinessStatus" NOT NULL DEFAULT 'empty';
