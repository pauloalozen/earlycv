-- Fase 3C, Tarefa 5 (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md
-- v3 + instrução da sessão 2026-09-05) — defesa estrutural REDUNDANTE, no
-- Postgres, da invariante formal já documentada em schema.prisma sobre
-- CvMasterDesignation (comentário do modelo): a aplicação (
-- CvMasterPromotionService, ResumesService#remove) já garante isso em
-- todo caminho conhecido; esta migration garante que NENHUM bug futuro na
-- aplicação (um novo entrypoint que esqueça de chamar syncResumeIsMaster,
-- por exemplo) consiga persistir um estado divergente, mesmo que só
-- silenciosamente — o banco recusa o COMMIT.
--
-- Cobre 4 defesas:
--   1/2/3. Trigger CONSTRAINT (DEFERRABLE INITIALLY DEFERRED, mesmo padrão
--      de trg_master_designation_subject_match, Fase 1) em
--      CvMasterDesignation: para toda designação ATIVA (supersededAt IS
--      NULL) de ownerType = USER, exige (checado no COMMIT, depois de
--      qualquer flip de Resume.isMaster que a mesma transação ainda vá
--      fazer):
--        - resumeId IS NOT NULL;
--        - o Resume referenciado existe e pertence ao MESMO userId
--          (cross-owner impossível);
--        - esse Resume tem isMaster = true (o índice único parcial
--          resume_one_master_per_user, Fase 1, já garante que ele é o
--          ÚNICO Resume.isMaster=true do usuário quando isso é verdade —
--          esta checagem cobre exatamente o caso "nenhum outro Resume, ou
--          o próprio referenciado, tem isMaster=true" que o índice sozinho
--          não cobre: ele impede DUAS linhas true simultâneas, mas nunca
--          garante que a linha true é a mesma que a designação aponta).
--      Guest (ownerType = GUEST) é ignorado pela trigger — exceção
--      deliberada documentada em schema.prisma.
--   4. Trigger BEFORE DELETE em Resume: bloqueia apagar um Resume enquanto
--      ele ainda for o resumeId de uma CvMasterDesignation ATIVA — decisão:
--      BLOQUEAR (nunca auto-supersedir), porque supersedir é uma decisão de
--      domínio (side-effects: limpar UserProfile, UserRadarProfile,
--      persistir MonitorProjectionJob — ver ResumesService#remove) que o
--      banco não tem contexto para tomar sozinho; o caminho correto já
--      supersede ANTES de apagar, na MESMA transação (mesmo padrão do
--      advisory lock de CvMasterPromotionService#supersedeIfResumeMatches)
--      — dentro dessa transação, no momento do DELETE, a trigger já
--      enxerga supersededAt preenchido (visibilidade da própria
--      transação) e não bloqueia. Só bloqueia quando ninguém supersedeu.

CREATE OR REPLACE FUNCTION check_master_designation_resume_integrity()
RETURNS trigger AS $$
DECLARE
  resume_user_id TEXT;
  resume_is_master BOOLEAN;
BEGIN
  -- Só designações ATIVAS de USER são cobertas — guest não tem Resume
  -- (exceção deliberada), e designações supersedidas são histórico morto,
  -- nunca precisam satisfazer o estado "ao vivo" do Resume.
  IF NEW."ownerType" != 'USER' OR NEW."supersededAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."resumeId" IS NULL THEN
    RAISE EXCEPTION
      'CvMasterDesignation integrity: active USER designation % has no resumeId (invariante formal, schema.prisma#CvMasterDesignation)',
      NEW.id;
  END IF;

  SELECT r."userId", r."isMaster" INTO resume_user_id, resume_is_master
    FROM "Resume" r WHERE r.id = NEW."resumeId";

  IF resume_user_id IS NULL THEN
    RAISE EXCEPTION
      'CvMasterDesignation integrity: active designation % references a Resume that does not exist (%)',
      NEW.id, NEW."resumeId";
  END IF;

  IF resume_user_id != NEW."userId" THEN
    RAISE EXCEPTION
      'CvMasterDesignation integrity: active designation % (userId=%) references a Resume owned by a different user (%)',
      NEW.id, NEW."userId", resume_user_id;
  END IF;

  IF resume_is_master IS NOT TRUE THEN
    RAISE EXCEPTION
      'CvMasterDesignation integrity: active designation % resumeId (%) does not have isMaster=true — Resume.isMaster and CvMasterDesignation diverged',
      NEW.id, NEW."resumeId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "trg_master_designation_resume_integrity"
  AFTER INSERT OR UPDATE ON "CvMasterDesignation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_master_designation_resume_integrity();

CREATE OR REPLACE FUNCTION prevent_delete_active_master_resume()
RETURNS trigger AS $$
DECLARE
  active_designation_id TEXT;
BEGIN
  SELECT d.id INTO active_designation_id
    FROM "CvMasterDesignation" d
    WHERE d."resumeId" = OLD.id AND d."supersededAt" IS NULL
    LIMIT 1;

  IF active_designation_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot delete Resume %: it is the resumeId of active CvMasterDesignation % — supersede the designation first (same transaction, see CvMasterPromotionService#supersedeIfResumeMatches)',
      OLD.id, active_designation_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_prevent_delete_active_master_resume"
  BEFORE DELETE ON "Resume"
  FOR EACH ROW EXECUTE FUNCTION prevent_delete_active_master_resume();
