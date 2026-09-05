-- Fase 3 (pré-rollout, docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md,
-- correção de resumes.service.ts#setPrimary): CvProcessingJob passa a
-- carregar, opcionalmente, qual Resume específico deve virar
-- isMaster=true quando (e somente quando) a promoção de Master deste job
-- de fato acontecer. Aditiva: coluna nullable, sem backfill necessário —
-- todo job existente continua com resumeId NULL (nunca precisou desse
-- flip, decidiam Resume.isMaster no momento da criação do Resume).

ALTER TABLE "CvProcessingJob" ADD COLUMN "resumeId" TEXT;

ALTER TABLE "CvProcessingJob"
  ADD CONSTRAINT "CvProcessingJob_resumeId_fkey"
  FOREIGN KEY ("resumeId") REFERENCES "Resume"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CvProcessingJob_resumeId_idx" ON "CvProcessingJob"("resumeId");
