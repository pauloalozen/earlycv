-- Cria o IngestionJob singleton que representa o backfill diário do Google
-- Indexing API (ver GoogleIndexingBackfillService/IngestionJobDispatchService).
-- nextRunAt = CURRENT_TIMESTAMP faz o primeiro lote rodar já no próximo tick
-- do scheduler (a cada minuto) em vez de esperar até as 3h — a partir daí
-- IngestionJobDispatchService.updateJobAfterRun recalcula nextRunAt para o
-- horário diário de verdade (calculateNextRunAt, DAILY 03:00). Idempotente
-- via ON CONFLICT no id fixo, mesmo padrão dos seeds de SemanticFilterConfig.
INSERT INTO "IngestionJob" (
  "id",
  "name",
  "description",
  "jobType",
  "scheduleType",
  "scheduleHour",
  "scheduleMinute",
  "isEnabled",
  "nextRunAt",
  "createdAt",
  "updatedAt"
)
VALUES (
  'seed-google-indexing-backfill-job',
  'Indexação de vagas (Google)',
  'Notifica a Google Indexing API sobre vagas ativas com enrichment concluído que ainda não foram notificadas, respeitando a cota diária.',
  'GOOGLE_INDEXING_BACKFILL',
  'DAILY',
  3,
  0,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
