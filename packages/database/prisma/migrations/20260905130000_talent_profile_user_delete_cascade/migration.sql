-- Fase 2F — corrige interação entre a corretiva da Fase 1
-- (20260904222812_cv_canonical_profile_pipeline_phase1_corrective, que
-- adicionou o CHECK talent_profile_requires_owner) e a exclusão de conta
-- (auth.service.ts#deleteCurrentUser, admin-users.service.ts), ambos
-- fluxos reais em produção que chamam database.user.delete() direto.
--
-- Achado ao rodar a suíte completa desta fase: TalentProfile.user tinha
-- ON DELETE SET NULL. Ao apagar um usuário com TalentProfile (userId
-- preenchido, talentSubjectId nulo — o caso comum de qualquer usuário
-- logado que já passou pela captura legada de talento), o SET NULL deixava
-- a linha com userId E talentSubjectId nulos, violando
-- talent_profile_requires_owner (CHECK adicionado exatamente para proibir
-- essa combinação em linhas novas/atualizadas). O DELETE do usuário
-- passava a falhar com uma violação de CHECK crua do Postgres.
--
-- Correção: ON DELETE CASCADE. Apagar a conta apaga também o TalentProfile
-- (e tudo que já é Cascade a partir dele — TalentCompetency,
-- TalentExperience, TalentEducation, TalentProfileSource, observações,
-- etc.), nunca deixa um TalentProfile sem dono para trás. Mesma política
-- de privacidade já aplicada ao restante da árvore de dados do usuário.
ALTER TABLE "TalentProfile" DROP CONSTRAINT "TalentProfile_userId_fkey";
ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
