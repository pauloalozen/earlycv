-- Correção do bug real documentado no relatório da auditoria Fase 2F
-- (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, seção 3):
-- talent-identity-resolver.ts#resolveForGuest podia criar TalentProfile sem
-- NENHUM dono (userId/talentSubjectId nulos), violando
-- talent_profile_requires_owner (migration 20260904222812) pra toda análise
-- de visitante sem sinal forte. Esta migration só adiciona um novo valor ao
-- enum TalentSubjectMergeReason, usado por
-- TalentSubjectService#adoptLegacyOwnerlessProfile para auditar a adoção
-- automática (tempo real, não backfill/revisão humana) de um TalentProfile
-- legado sem dono quando o resolver o toca de novo.
--
-- Aditiva, sem risco de dado: ALTER TYPE ... ADD VALUE nunca falha por causa
-- de linhas existentes.

ALTER TYPE "TalentSubjectMergeReason" ADD VALUE 'LEGACY_PROFILE_ADOPTED';
