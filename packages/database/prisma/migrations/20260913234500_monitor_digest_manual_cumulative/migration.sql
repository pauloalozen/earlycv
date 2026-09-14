-- Disparo manual do digest (ADMIN_MANUAL) deixa de apagar/substituir o
-- digest anterior do mesmo usuário/dia — cada disparo agora acumula uma
-- linha nova em MonitorDigest, preservando o histórico de eventos do
-- webhook do envio anterior (antes, MonitorDigestEvent.onDelete=Cascade
-- apagava tudo junto quando o admin reenviava no mesmo dia).
--
-- A idempotência original (userId, frequency, scheduledFor) só fazia
-- sentido pro SCHEDULER (nunca duplicar o envio automático do mesmo
-- período) — substituída por um índice único PARCIAL que só se aplica a
-- source='SCHEDULER'. Não é representável no @@unique do Prisma (sem
-- suporte a índice parcial na DSL), por isso SQL cru aqui; o
-- schema.prisma expõe as mesmas 3 colunas como @@index simples, só para
-- performance de leitura — a unicidade de verdade vive neste índice.
DROP INDEX "MonitorDigest_userId_frequency_scheduledFor_key";

CREATE UNIQUE INDEX "MonitorDigest_userId_frequency_scheduledFor_scheduler_key"
  ON "MonitorDigest" ("userId", "frequency", "scheduledFor")
  WHERE "source" = 'SCHEDULER';

CREATE INDEX "MonitorDigest_userId_frequency_scheduledFor_idx"
  ON "MonitorDigest" ("userId", "frequency", "scheduledFor");
