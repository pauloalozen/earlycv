-- 2ª rodada de auditoria adversarial (2026-09-08), achado 2: READY não era
-- terminal. A trigger reject_ready_profile_mutation (Fase 1) só protegia
-- os campos de DADOS de CvStructuredProfile depois de READY — o campo
-- "status" em si podia sair de READY para PENDING/PROCESSING/FAILED sem
-- nenhum bloqueio no banco, confirmado por execução real na 2ª rodada
-- (testes CONTINUIDADE 1/2). CREATE OR REPLACE da MESMA função da
-- migration 20260904220951 (nunca editada aqui) — a trigger já existente
-- (trg_reject_ready_profile_mutation) passa a rodar esta versão nova sem
-- precisar ser recriada.
CREATE OR REPLACE FUNCTION reject_ready_profile_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'READY' AND (
    NEW."status" IS DISTINCT FROM OLD."status" OR
    NEW."canonicalJson" IS DISTINCT FROM OLD."canonicalJson" OR
    NEW."coverageJson" IS DISTINCT FROM OLD."coverageJson" OR
    NEW."confidenceJson" IS DISTINCT FROM OLD."confidenceJson" OR
    NEW."evidenceJson" IS DISTINCT FROM OLD."evidenceJson" OR
    NEW."extractorVersion" IS DISTINCT FROM OLD."extractorVersion" OR
    NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion" OR
    NEW."cvSourceId" IS DISTINCT FROM OLD."cvSourceId"
  ) THEN
    RAISE EXCEPTION 'CvStructuredProfile is immutable once READY (status included — READY is terminal)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
