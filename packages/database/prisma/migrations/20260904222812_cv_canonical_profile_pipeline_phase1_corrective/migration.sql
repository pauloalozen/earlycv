-- Corretiva pós-validação da Fase 1 (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md)
-- Dois ajustes, ambos aditivos/não-destrutivos:

-- =============================================================================
-- 1. TalentProfile passa a exigir pelo menos um dono para linhas NOVAS, sem
-- quebrar as 187 linhas legadas existentes (userId e talentSubjectId nulos).
-- NOT VALID: não escaneia as linhas existentes agora (não falha por causa
-- delas), mas passa a valer para todo INSERT/UPDATE novo a partir daqui.
-- A validação retroativa (VALIDATE CONSTRAINT) só roda depois do backfill da
-- Fase 4, quando as 187 linhas legadas tiverem ganho um talentSubjectId.
-- =============================================================================

ALTER TABLE "TalentProfile"
ADD CONSTRAINT "talent_profile_requires_owner"
CHECK (
  "userId" IS NOT NULL OR "talentSubjectId" IS NOT NULL
) NOT VALID;

-- talent_profile_owner_xor (Fase 1) continua intacta, impedindo os dois
-- donos simultâneos. As duas constraints juntas fecham a regra: para
-- linhas novas, exatamente um dono; para linhas legadas, zero ou um.

-- =============================================================================
-- 2. CvSource.talentSubjectId deixa de cascatear a exclusão do TalentSubject.
-- Um TalentSubject consolidado é marcado como merged (mergedIntoUserId/
-- mergedIntoTalentProfileId/mergedAt), nunca apagado como efeito colateral.
-- Exclusão integral por privacidade é um fluxo específico e auditado, que
-- lida explicitamente com toda a árvore de dados — não uma cascade
-- incidental disparada por outro caminho de código.
-- =============================================================================

ALTER TABLE "CvSource" DROP CONSTRAINT "CvSource_talentSubjectId_fkey";
ALTER TABLE "CvSource" ADD CONSTRAINT "CvSource_talentSubjectId_fkey"
  FOREIGN KEY ("talentSubjectId") REFERENCES "TalentSubject"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
