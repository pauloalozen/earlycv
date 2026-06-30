ALTER TABLE "AnalysisCvSnapshot"
ADD COLUMN IF NOT EXISTS "professionalProfileFingerprint" TEXT,
ADD COLUMN IF NOT EXISTS "professionalProfileJson" JSONB;

UPDATE "AnalysisCvSnapshot"
SET
  "professionalProfileFingerprint" = COALESCE(
    "professionalProfileFingerprint",
    COALESCE("textSha256", "id")
  ),
  "professionalProfileJson" = COALESCE(
    "professionalProfileJson",
    jsonb_build_object(
      'version',
      'backfill_v1',
      'textSha256',
      "textSha256"
    )
  )
WHERE
  "professionalProfileFingerprint" IS NULL
  OR "professionalProfileJson" IS NULL;

ALTER TABLE "AnalysisCvSnapshot"
ALTER COLUMN "professionalProfileFingerprint" SET NOT NULL,
ALTER COLUMN "professionalProfileJson" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "AnalysisCvSnapshot_professionalProfileFingerprint_idx"
ON "AnalysisCvSnapshot"("professionalProfileFingerprint");
