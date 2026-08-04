import { PrismaClient } from "@prisma/client";

// Script one-shot para zerar dados de execucao de ingestao/enriquecimento
// em homolog antes de comecar a usar o modelo de IngestionJob (Sprint 3).
// NAO roda em CI nem e chamado por nenhum outro codigo — execucao manual
// via `tsx src/scripts/reset-ingestion-homolog.ts`, com CONFIRM=yes
// explicito pra evitar rodar sem querer contra o DATABASE_URL errado.
//
// Ordem de delecao respeita FKs: filhos antes de pais (IngestionJobRun
// antes de IngestionJob, IngestionBatchItem antes de IngestionBatchRun,
// JobEnrichment/CrawlerDiscardedTitle antes de Job). JobSource e mantida
// intacta — so o agendamento e o estado do circuit breaker sao zerados.

async function main() {
  if (process.env.CONFIRM !== "yes") {
    console.error(
      "Recusando rodar sem confirmacao explicita. Rode com CONFIRM=yes " +
        "e DATABASE_URL apontando pro banco de homolog correto.",
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();

  try {
    console.log(`[reset-ingestion-homolog] alvo: ${maskDatabaseUrl()}`);

    await prisma.$transaction([
      prisma.ingestionJobRun.deleteMany(),
      prisma.ingestionJob.deleteMany(),
      prisma.ingestionBatchItem.deleteMany(),
      prisma.ingestionBatchRun.deleteMany(),
      prisma.ingestionRun.deleteMany(),
      prisma.jobEnrichment.deleteMany(),
      prisma.job.deleteMany(),
      prisma.crawlerDiscardedTitle.deleteMany(),
      prisma.jobSource.updateMany({
        data: {
          consecutive403Count: 0,
          lastCheckedAt: null,
          lastErrorAt: null,
          lastErrorMessage: null,
          lastSuccessAt: null,
          pauseReason: null,
          pausedUntil: null,
          scheduleCron: null,
          scheduleEnabled: false,
        },
      }),
      prisma.ingestionSchedulerConfig.updateMany({
        data: {
          enabled: false,
          enrichmentEnabled: false,
          globalCron: null,
        },
      }),
    ]);

    console.log("[reset-ingestion-homolog] concluido.");
  } finally {
    await prisma.$disconnect();
  }
}

function maskDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? "";
  return url.replace(/:\/\/[^@]*@/, "://***@");
}

main().catch((error) => {
  console.error("[reset-ingestion-homolog] falhou:", error);
  process.exitCode = 1;
});
