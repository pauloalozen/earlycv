-- Drift pré-existente entre schema.prisma e o histórico de migrations,
-- detectado incidentalmente pelo `prisma migrate dev` ao gerar a migration
-- de e-mail multi-provider (20260913143816_email_multi_provider_ses) — não
-- relacionado a e-mail/Monitor. Isolado nesta migration própria por
-- pedido explícito: uma migration de e-mail não deve carregar correção
-- incidental de drift de outro domínio. Sem efeito em dado, só normaliza
-- o nome do índice.
-- RenameIndex
ALTER INDEX "TalentExperienceObservation_talentProfileId_cvStructuredP_key" RENAME TO "TalentExperienceObservation_talentProfileId_cvStructuredPro_key";
