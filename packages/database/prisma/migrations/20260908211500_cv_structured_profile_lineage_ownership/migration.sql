-- 2ª rodada de auditoria adversarial (2026-09-08), achado 3: a trigger de
-- 20260905131500 só verificava "existe algum CvStructuredProfile READY" —
-- nunca que era o perfil CERTO (produzido pelo próprio CvProcessingJob
-- desta análise) nem que o dono bate. Confirmado por execução real
-- (CONTINUIDADE 5 da 2ª rodada): repontar AnalysisJob.cvStructuredProfileId
-- para um perfil READY válido de OUTRO usuário/análise era aceito.
--
-- CREATE OR REPLACE da MESMA função da migration 20260905131500 (nunca
-- editada aqui) — extensão aditiva, mesma trigger já existente.
CREATE OR REPLACE FUNCTION check_analysis_job_succeeded_requires_ready_profile()
RETURNS trigger AS $$
DECLARE
  profile_status "CvStructuredProfileStatus";
  cv_job "CvProcessingJob"%ROWTYPE;
  source "CvSource"%ROWTYPE;
  owner_talent_subject_id TEXT;
  has_grant BOOLEAN;
  is_transitioning_or_relineaged BOOLEAN;
BEGIN
  -- Achado real rodando os testes desta rodada: um UPDATE incidental numa
  -- linha JÁ succeeded que não mexe em cvProcessingJobId/cvStructuredProfileId
  -- (ex.: claimGuestAnalysisJob transferindo AnalysisJob.userId do guest pro
  -- usuário, ANTES de ClaimSourceGrant existir — dois statements
  -- separados, não uma transação só) reavaliava ownership com o grant
  -- ainda não criado e falhava por engano. Só reavalia linhagem/ownership
  -- quando (a) esta é a transição PRA succeeded, ou (b) cvProcessingJobId/
  -- cvStructuredProfileId de fato mudaram nesta linha — nunca em updates
  -- que só tocam outros campos (userId, jobTitle, etc.) de uma linha que
  -- já era succeeded com a MESMA linhagem.
  is_transitioning_or_relineaged := (
    TG_OP = 'INSERT' OR
    OLD.status IS DISTINCT FROM 'succeeded' OR
    NEW."cvProcessingJobId" IS DISTINCT FROM OLD."cvProcessingJobId" OR
    NEW."cvStructuredProfileId" IS DISTINCT FROM OLD."cvStructuredProfileId"
  );

  IF NEW.status = 'succeeded' AND NEW."cvProcessingJobId" IS NOT NULL
     AND is_transitioning_or_relineaged THEN
    IF NEW."cvStructuredProfileId" IS NULL THEN
      RAISE EXCEPTION 'AnalysisJob succeeded via pipeline novo (cvProcessingJobId preenchido) exige cvStructuredProfileId preenchido';
    END IF;

    SELECT * INTO cv_job FROM "CvProcessingJob" WHERE id = NEW."cvProcessingJobId";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'AnalysisJob.cvProcessingJobId (%) referencia um CvProcessingJob inexistente', NEW."cvProcessingJobId";
    END IF;

    -- Linhagem: o perfil referenciado precisa ser EXATAMENTE o que o
    -- próprio CvProcessingJob desta análise produziu — nunca outro perfil
    -- READY qualquer, mesmo que válido e do mesmo usuário.
    IF cv_job."cvStructuredProfileId" IS DISTINCT FROM NEW."cvStructuredProfileId" THEN
      RAISE EXCEPTION 'AnalysisJob.cvStructuredProfileId (%) não corresponde ao CvStructuredProfile produzido pelo seu CvProcessingJob (%) — linhagem quebrada', NEW."cvStructuredProfileId", cv_job."cvStructuredProfileId";
    END IF;

    SELECT status INTO profile_status
      FROM "CvStructuredProfile"
      WHERE id = NEW."cvStructuredProfileId";

    IF profile_status IS DISTINCT FROM 'READY' THEN
      RAISE EXCEPTION 'AnalysisJob succeeded exige CvStructuredProfile READY (encontrado: %)', profile_status;
    END IF;

    -- Ownership: dono do CvSource (via o próprio CvProcessingJob) precisa
    -- ser o mesmo usuário desta análise, OU o usuário precisa ter um
    -- ClaimSourceGrant válido sobre essa fonte (claim granular, Fase 2E —
    -- nunca reatribui CvSource.userId, só formaliza acesso). Para guest,
    -- comparado via TalentSubjectSessionSignal (guestSessionHash ->
    -- talentSubjectId), quando existente.
    SELECT * INTO source FROM "CvSource" WHERE id = cv_job."cvSourceId";

    IF NEW."userId" IS NOT NULL AND source.id IS NOT NULL THEN
      IF source."userId" IS DISTINCT FROM NEW."userId" THEN
        SELECT EXISTS(
          SELECT 1 FROM "ClaimSourceGrant"
          WHERE "cvSourceId" = source.id AND "userId" = NEW."userId"
        ) INTO has_grant;
        IF NOT has_grant THEN
          RAISE EXCEPTION 'AnalysisJob.userId (%) não é dono do CvSource (%) do CvStructuredProfile referenciado, nem possui ClaimSourceGrant válido sobre ele', NEW."userId", source.id;
        END IF;
      END IF;
    ELSIF NEW."userId" IS NULL AND NEW."guestSessionHash" IS NOT NULL AND source.id IS NOT NULL THEN
      SELECT "talentSubjectId" INTO owner_talent_subject_id
        FROM "TalentSubjectSessionSignal"
        WHERE "guestSessionHash" = NEW."guestSessionHash";
      IF owner_talent_subject_id IS NOT NULL
         AND source."talentSubjectId" IS DISTINCT FROM owner_talent_subject_id THEN
        RAISE EXCEPTION 'AnalysisJob guest (guestSessionHash=%) não corresponde ao TalentSubject dono do CvSource (%) do CvStructuredProfile referenciado', NEW."guestSessionHash", source.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Coerência equivalente para AnalysisCvSnapshot: quando referenciada por um
-- AnalysisJob do pipeline novo, seu cvStructuredProfileId (se preenchido)
-- precisa bater com o cvStructuredProfileId daquele AnalysisJob — nunca
-- apontar para um perfil canônico diferente do que a própria análise usou.
CREATE OR REPLACE FUNCTION check_analysis_cv_snapshot_lineage()
RETURNS trigger AS $$
DECLARE
  job "AnalysisJob"%ROWTYPE;
BEGIN
  IF NEW."cvStructuredProfileId" IS NOT NULL THEN
    SELECT * INTO job
      FROM "AnalysisJob"
      WHERE "analysisCvSnapshotId" = NEW.id AND "cvProcessingJobId" IS NOT NULL
      LIMIT 1;
    IF FOUND AND job."cvStructuredProfileId" IS DISTINCT FROM NEW."cvStructuredProfileId" THEN
      RAISE EXCEPTION 'AnalysisCvSnapshot.cvStructuredProfileId (%) diverge do AnalysisJob que a referencia (%) — linhagem quebrada', NEW."cvStructuredProfileId", job."cvStructuredProfileId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_analysis_cv_snapshot_lineage
  AFTER INSERT OR UPDATE ON "AnalysisCvSnapshot"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_analysis_cv_snapshot_lineage();

-- Coerência equivalente para CvAdaptation: quando é a materialização de um
-- AnalysisJob do pipeline novo (convertedCvAdaptationId aponta pra ela),
-- seu cvStructuredProfileId (se preenchido) precisa bater com o da própria
-- análise que a converteu.
CREATE OR REPLACE FUNCTION check_cv_adaptation_lineage()
RETURNS trigger AS $$
DECLARE
  job "AnalysisJob"%ROWTYPE;
BEGIN
  IF NEW."cvStructuredProfileId" IS NOT NULL THEN
    SELECT * INTO job
      FROM "AnalysisJob"
      WHERE "convertedCvAdaptationId" = NEW.id AND "cvProcessingJobId" IS NOT NULL
      LIMIT 1;
    IF FOUND AND job."cvStructuredProfileId" IS DISTINCT FROM NEW."cvStructuredProfileId" THEN
      RAISE EXCEPTION 'CvAdaptation.cvStructuredProfileId (%) diverge do AnalysisJob que a converteu (%) — linhagem quebrada', NEW."cvStructuredProfileId", job."cvStructuredProfileId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_cv_adaptation_lineage
  AFTER INSERT OR UPDATE ON "CvAdaptation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_cv_adaptation_lineage();
