-- CreateEnum
CREATE TYPE "MonitorDigestSource" AS ENUM ('SCHEDULER', 'ADMIN_MANUAL');

-- AlterTable
ALTER TABLE "MonitorDigest" ADD COLUMN     "source" "MonitorDigestSource" NOT NULL DEFAULT 'SCHEDULER',
ADD COLUMN     "triggeredByAdminId" TEXT;

-- CreateTable
CREATE TABLE "MonitorDigestScheduleConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "dailyHour" INTEGER NOT NULL DEFAULT 11,
    "dailyMinute" INTEGER NOT NULL DEFAULT 0,
    "weeklyDayOfWeek" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAdminId" TEXT,

    CONSTRAINT "MonitorDigestScheduleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorDigestEmailContent" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "subject" TEXT NOT NULL,
    "introText" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAdminId" TEXT,

    CONSTRAINT "MonitorDigestEmailContent_pkey" PRIMARY KEY ("id")
);

-- Seed dos singletons com os valores hoje hardcoded em
-- monitor-digest.scheduler.ts / monitor-digest-schedule.util.ts (11:00
-- America/Sao_Paulo diário, segunda-feira pro semanal) e o template de
-- assunto equivalente ao gerado hoje em monitor-digest-email.service.ts
-- ({count} é substituído em runtime; o caso singular continua fixo em
-- código pra não quebrar a concordância "1 nova oportunidade"). introText
-- nasce vazio de propósito — zero mudança de comportamento visível até um
-- admin preencher pelo painel.
INSERT INTO "MonitorDigestScheduleConfig" ("id", "dailyHour", "dailyMinute", "weeklyDayOfWeek", "timezone", "updatedAt")
VALUES ('default', 11, 0, 1, 'America/Sao_Paulo', CURRENT_TIMESTAMP);

INSERT INTO "MonitorDigestEmailContent" ("id", "subject", "introText", "updatedAt")
VALUES ('default', 'Encontramos {count} novas oportunidades para você', '', CURRENT_TIMESTAMP);
