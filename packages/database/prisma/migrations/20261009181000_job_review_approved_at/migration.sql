-- Aprovação manual de vaga em revisão (JobStatus.pending_review).
-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "reviewApprovedAt" TIMESTAMP(3);

