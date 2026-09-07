-- Preserva a intenção de quem já tinha desligado o e-mail via frequency=OFF
-- antes de derrubar a coluna (emailEnabled vira o único interruptor).
UPDATE "MonitorAlertPreference" SET "emailEnabled" = false WHERE "frequency" = 'OFF';

-- AlterTable: cadência global (ainda contra o enum antigo, que inclui OFF
-- por enquanto — troca de tipo acontece no bloco AlterEnum abaixo).
ALTER TABLE "MonitorDigestScheduleConfig"
  ADD COLUMN "frequency" "MonitorDigestFrequency" NOT NULL DEFAULT 'DAILY',
  ADD COLUMN "intervalAnchorDate" TIMESTAMP(3);

-- AlterEnum: remove OFF, adiciona EVERY_2_DAYS/EVERY_3_DAYS/EVERY_4_DAYS.
-- MonitorAlertPreference.frequency é derrubada AQUI DENTRO (não no final do
-- arquivo) — precisa sumir antes do DROP TYPE do enum antigo, senão o
-- Postgres recusa (coluna ainda dependente do tipo).
BEGIN;
CREATE TYPE "MonitorDigestFrequency_new" AS ENUM ('DAILY', 'EVERY_2_DAYS', 'EVERY_3_DAYS', 'EVERY_4_DAYS', 'WEEKLY');
ALTER TABLE "MonitorDigestScheduleConfig" ALTER COLUMN "frequency" DROP DEFAULT;
ALTER TABLE "MonitorDigest" ALTER COLUMN "frequency" TYPE "MonitorDigestFrequency_new" USING ("frequency"::text::"MonitorDigestFrequency_new");
ALTER TABLE "MonitorDigestScheduleConfig" ALTER COLUMN "frequency" TYPE "MonitorDigestFrequency_new" USING ("frequency"::text::"MonitorDigestFrequency_new");
ALTER TABLE "MonitorDigestScheduleConfig" ALTER COLUMN "frequency" SET DEFAULT 'DAILY';
ALTER TABLE "MonitorAlertPreference" DROP COLUMN "frequency";
ALTER TYPE "MonitorDigestFrequency" RENAME TO "MonitorDigestFrequency_old";
ALTER TYPE "MonitorDigestFrequency_new" RENAME TO "MonitorDigestFrequency";
DROP TYPE "MonitorDigestFrequency_old";
COMMIT;
