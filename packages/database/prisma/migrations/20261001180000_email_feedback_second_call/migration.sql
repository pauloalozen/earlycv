-- Feedback segunda chamada (14 dias após o envio do primeiro feedback).
-- Só aditivo/renomeação de valor de enum: nenhum dado é apagado.

-- Novo tipo de envio.
ALTER TYPE "EmailDispatchKind" ADD VALUE 'FEEDBACK_SECOND_CALL';

-- Chave própria de modo (OFF por padrão).
ALTER TABLE "EmailDispatchSettings"
  ADD COLUMN "feedbackSecondCallMode" "EmailDispatchMode" NOT NULL DEFAULT 'OFF';

-- Templates: o antigo "neutro" vira a segunda chamada (texto salvo, se houver,
-- é preservado) e "viu a análise" vira o feedback único do primeiro envio.
ALTER TYPE "EmailTemplateKey" RENAME VALUE 'FEEDBACK_NEUTRAL' TO 'FEEDBACK_SECOND_CALL';
ALTER TYPE "EmailTemplateKey" RENAME VALUE 'FEEDBACK_VIEWED' TO 'FEEDBACK_FIRST_USE';
