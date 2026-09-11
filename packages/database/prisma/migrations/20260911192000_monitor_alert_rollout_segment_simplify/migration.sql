-- TRACKED_PAID/TRACKED_ONLY nunca chegaram a ser persistidos em nenhuma
-- linha (MonitorAlertRolloutPolicy.segment sempre validado como ALL/PAID
-- em código; a ação pontual "aplicar agora" nunca gravava o segmento
-- escolhido em lugar nenhum, era só parâmetro de request) — remoção segura,
-- sem dado existente pra migrar. Postgres não permite DROP VALUE direto em
-- enum com coluna dependente, então recria o tipo (mesmo padrão da
-- migration 20260907174156_monitor_global_digest_frequency).
BEGIN;
CREATE TYPE "MonitorAlertBulkSegment_new" AS ENUM ('ALL', 'PAID');
ALTER TABLE "MonitorAlertRolloutPolicy" ALTER COLUMN "segment" DROP DEFAULT;
ALTER TABLE "MonitorAlertRolloutPolicy" ALTER COLUMN "segment" TYPE "MonitorAlertBulkSegment_new" USING ("segment"::text::"MonitorAlertBulkSegment_new");
ALTER TABLE "MonitorAlertRolloutPolicy" ALTER COLUMN "segment" SET DEFAULT 'ALL';
ALTER TYPE "MonitorAlertBulkSegment" RENAME TO "MonitorAlertBulkSegment_old";
ALTER TYPE "MonitorAlertBulkSegment_new" RENAME TO "MonitorAlertBulkSegment";
DROP TYPE "MonitorAlertBulkSegment_old";
COMMIT;
