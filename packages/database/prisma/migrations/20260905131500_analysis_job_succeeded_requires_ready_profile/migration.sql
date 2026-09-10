-- Fase 2F — defesa de banco para a garantia formal da seção 1.2/11 do plano
-- (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md): um
-- AnalysisJob só pode ir a "succeeded" com um CvStructuredProfile READY por
-- trás. Até aqui isso era só invariante de aplicação (testada em
-- cv-analysis.worker.spec/e2e, nunca violada pelo código atual), sem
-- proteção real contra um UPDATE direto/futuro que esqueça a regra.
--
-- Aplicada SOMENTE quando "cvProcessingJobId" IS NOT NULL — ou seja, só nas
-- linhas que passaram pelo pipeline novo (Fase 2C em diante). O
-- AnalysisJob legado (caminho pré-Fase-2, cvProcessingJobId e
-- cvStructuredProfileId sempre nulos) continua podendo ir a "succeeded"
-- sem nenhuma dessas colunas — comportamento inalterado, nenhuma linha
-- histórica é escaneada ou invalidada por esta migration.
CREATE OR REPLACE FUNCTION check_analysis_job_succeeded_requires_ready_profile()
RETURNS trigger AS $$
DECLARE
  profile_status "CvStructuredProfileStatus";
BEGIN
  IF NEW.status = 'succeeded' AND NEW."cvProcessingJobId" IS NOT NULL THEN
    IF NEW."cvStructuredProfileId" IS NULL THEN
      RAISE EXCEPTION 'AnalysisJob succeeded via pipeline novo (cvProcessingJobId preenchido) exige cvStructuredProfileId preenchido';
    END IF;

    SELECT status INTO profile_status
      FROM "CvStructuredProfile"
      WHERE id = NEW."cvStructuredProfileId";

    IF profile_status IS DISTINCT FROM 'READY' THEN
      RAISE EXCEPTION 'AnalysisJob succeeded exige CvStructuredProfile READY (encontrado: %)', profile_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- DEFERRABLE INITIALLY DEFERRED, mesmo padrão de
-- trg_master_designation_subject_match (Fase 1): dentro de uma mesma
-- transação, o CvStructuredProfile pode ainda não estar com status='READY'
-- no instante exato do UPDATE do AnalysisJob (ordem de escrita), mas
-- sempre estará no COMMIT — momento em que a trigger de fato roda.
CREATE CONSTRAINT TRIGGER trg_analysis_job_succeeded_requires_ready_profile
  AFTER INSERT OR UPDATE ON "AnalysisJob"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_analysis_job_succeeded_requires_ready_profile();
