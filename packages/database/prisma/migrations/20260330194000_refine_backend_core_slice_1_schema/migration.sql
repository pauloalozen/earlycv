-- AlterEnum
BEGIN;
CREATE TYPE "AuthProvider_new" AS ENUM ('credentials', 'google', 'linkedin');
ALTER TABLE "AuthAccount" ALTER COLUMN "provider" TYPE "AuthProvider_new" USING ("provider"::text::"AuthProvider_new");
ALTER TYPE "AuthProvider" RENAME TO "AuthProvider_old";
ALTER TYPE "AuthProvider_new" RENAME TO "AuthProvider";
DROP TYPE "public"."AuthProvider_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "CrawlStrategy_new" AS ENUM ('html', 'api', 'feed');
ALTER TABLE "JobSource" ALTER COLUMN "crawlStrategy" TYPE "CrawlStrategy_new" USING ("crawlStrategy"::text::"CrawlStrategy_new");
ALTER TYPE "CrawlStrategy" RENAME TO "CrawlStrategy_old";
ALTER TYPE "CrawlStrategy_new" RENAME TO "CrawlStrategy";
DROP TYPE "public"."CrawlStrategy_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "JobSourceType_new" AS ENUM ('workday', 'greenhouse', 'lever', 'gupy', 'kenoby', 'successfactors', 'custom_html', 'custom_api');
ALTER TABLE "JobSource" ALTER COLUMN "sourceType" TYPE "JobSourceType_new" USING ("sourceType"::text::"JobSourceType_new");
ALTER TYPE "JobSourceType" RENAME TO "JobSourceType_old";
ALTER TYPE "JobSourceType_new" RENAME TO "JobSourceType";
DROP TYPE "public"."JobSourceType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "JobStatus_new" AS ENUM ('active', 'inactive', 'removed');
ALTER TABLE "public"."Job" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Job" ALTER COLUMN "status" TYPE "JobStatus_new" USING ("status"::text::"JobStatus_new");
ALTER TYPE "JobStatus" RENAME TO "JobStatus_old";
ALTER TYPE "JobStatus_new" RENAME TO "JobStatus";
DROP TYPE "public"."JobStatus_old";
ALTER TABLE "Job" ALTER COLUMN "status" SET DEFAULT 'active';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "RemotePreference_new" AS ENUM ('remote', 'hybrid', 'onsite', 'flexible');
ALTER TABLE "UserProfile" ALTER COLUMN "remotePreference" TYPE "RemotePreference_new" USING ("remotePreference"::text::"RemotePreference_new");
ALTER TYPE "RemotePreference" RENAME TO "RemotePreference_old";
ALTER TYPE "RemotePreference_new" RENAME TO "RemotePreference";
DROP TYPE "public"."RemotePreference_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ResumeStatus_new" AS ENUM ('draft', 'uploaded', 'reviewed', 'failed');
ALTER TABLE "public"."Resume" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Resume" ALTER COLUMN "status" TYPE "ResumeStatus_new" USING ("status"::text::"ResumeStatus_new");
ALTER TYPE "ResumeStatus" RENAME TO "ResumeStatus_old";
ALTER TYPE "ResumeStatus_new" RENAME TO "ResumeStatus";
DROP TYPE "public"."ResumeStatus_old";
ALTER TABLE "Resume" ALTER COLUMN "status" SET DEFAULT 'draft';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserPlanType_new" AS ENUM ('free');
ALTER TABLE "public"."User" ALTER COLUMN "planType" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "planType" TYPE "UserPlanType_new" USING ("planType"::text::"UserPlanType_new");
ALTER TYPE "UserPlanType" RENAME TO "UserPlanType_old";
ALTER TYPE "UserPlanType_new" RENAME TO "UserPlanType";
DROP TYPE "public"."UserPlanType_old";
ALTER TABLE "User" ALTER COLUMN "planType" SET DEFAULT 'free';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserStatus_new" AS ENUM ('active', 'pending', 'suspended', 'deleted');
ALTER TABLE "public"."User" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "status" TYPE "UserStatus_new" USING ("status"::text::"UserStatus_new");
ALTER TYPE "UserStatus" RENAME TO "UserStatus_old";
ALTER TYPE "UserStatus_new" RENAME TO "UserStatus";
DROP TYPE "public"."UserStatus_old";
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'pending';
COMMIT;

-- AlterTable
ALTER TABLE "Job" ALTER COLUMN "status" SET DEFAULT 'active';

-- AlterTable
ALTER TABLE "Resume" ADD COLUMN     "primaryResumeSlot" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'draft';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "planType" SET DEFAULT 'free',
ALTER COLUMN "status" SET DEFAULT 'pending';

-- CreateIndex
CREATE UNIQUE INDEX "Resume_userId_primaryResumeSlot_key" ON "Resume"("userId", "primaryResumeSlot");

