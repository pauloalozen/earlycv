-- 3ª rodada de auditoria adversarial (2026-09-09): TalentExperience (tabela
-- legada) é chaveada por (sourceRecordId, companyNormalized, roleNormalized)
-- — duas experiências reais no mesmo CV, mesma empresa e mesmo cargo (duas
-- passagens, ou o mesmo cargo repetido em períodos diferentes), colidem na
-- mesma chave e uma sobrescreve a outra. Empresa+cargo não identifica
-- unicamente uma experiência. Mesmo padrão das demais tabelas de
-- observação já existentes (TalentEducationObservation etc.): itemIndex —
-- a posição real no array do CV — sempre distingue, mesmo quando o
-- itemFingerprint de conteúdo colide entre duas entradas. Aditiva: não
-- altera TalentExperience, que continua existindo como visão consolidada/
-- cache legado.
CREATE TABLE "TalentExperienceObservation" (
    "id" TEXT NOT NULL,
    "talentProfileId" TEXT NOT NULL,
    "cvStructuredProfileId" TEXT NOT NULL,
    "itemFingerprint" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "companyRaw" TEXT NOT NULL,
    "roleRaw" TEXT NOT NULL,
    "locationRaw" TEXT,
    "periodRaw" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "technologiesUsed" TEXT[],
    "bulletsJson" JSONB,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentExperienceObservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TalentExperienceObservation_talentProfileId_cvStructuredP_key"
    ON "TalentExperienceObservation"("talentProfileId", "cvStructuredProfileId", "itemFingerprint", "itemIndex");

CREATE INDEX "TalentExperienceObservation_talentProfileId_idx"
    ON "TalentExperienceObservation"("talentProfileId");

ALTER TABLE "TalentExperienceObservation"
    ADD CONSTRAINT "TalentExperienceObservation_talentProfileId_fkey"
    FOREIGN KEY ("talentProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TalentExperienceObservation"
    ADD CONSTRAINT "TalentExperienceObservation_cvStructuredProfileId_fkey"
    FOREIGN KEY ("cvStructuredProfileId") REFERENCES "CvStructuredProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
