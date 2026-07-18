-- Linhas existentes foram criadas sob o fluxo antigo (tudo ou nada): só
-- existiam depois de gerar com sucesso. Sem isso ficariam marcadas como
-- "pending" e o polling ia tentar reprocessar preparações já prontas.
UPDATE "JobApplicationInterviewPrep"
SET "status" = 'succeeded'
WHERE "status" = 'pending' AND "generatedContentJson" IS NOT NULL;
