-- AlterTable
ALTER TABLE "TalentProfile" ALTER COLUMN "primaryAreas" SET DEFAULT ARRAY[]::"JobArea"[];

-- Backfill: linhas criadas antes desse default ficaram com NULL em vez de
-- array vazio quando a IA não classificou nenhuma área — normaliza pra
-- array vazio, que é o que o app sempre esperou (ver mapProfileCache).
UPDATE "TalentProfile" SET "primaryAreas" = ARRAY[]::"JobArea"[] WHERE "primaryAreas" IS NULL;
