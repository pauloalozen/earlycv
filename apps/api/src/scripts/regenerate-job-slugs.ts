// PR 2b, decisão A (restrita): regenera o slug só das vagas com o ID interno
// do ATS no título ("[Job-32186] ...") e das vagas com empresa reatribuída
// (ver planSlugRegeneration). A URL antiga responde 308 para a nova pelo
// cuid no fim do slug. Vaga ativa vai para a fila da Indexing API
// (URL_UPDATED, prioridade de backfill).
//
// Por padrão roda em --dry-run (só lê e reporta). Passe --apply pra gravar.
// Rodar depois do deploy que limpa o título na ingestão.
//
// Por enquanto só as vagas com [Job-N] (decisão de 10/10: o dry-run no
// homolog achou 3.686 vagas com empresa reatribuída, em 506 pares, e essa
// lista ainda vai ser revisada). --include-company-changed inclui as
// reatribuídas; em dry-run, serve para gerar a lista de revisão.
//
//   npm run jobs:regenerate-slugs --workspace @earlycv/api
//   npm run jobs:regenerate-slugs --workspace @earlycv/api -- --apply
//   npm run jobs:regenerate-slugs --workspace @earlycv/api -- --include-company-changed

import { type Prisma, PrismaClient } from "@prisma/client";

import type { DatabaseService } from "../database/database.service";
import { GoogleIndexingService } from "../google-indexing/google-indexing.service";
import {
  GoogleIndexingQueueService,
  INDEXING_PRIORITY,
} from "../google-indexing/google-indexing-queue.service";
import { planSlugRegeneration } from "../jobs/job-slug-regeneration";

const APPLY = process.argv.includes("--apply");
const INCLUDE_COMPANY_CHANGED = process.argv.includes(
  "--include-company-changed",
);
const LOG = "[regenerate-job-slugs]";

async function main() {
  const prisma = new PrismaClient();
  const database = prisma as unknown as DatabaseService;
  const indexingQueue = new GoogleIndexingQueueService(
    database,
    new GoogleIndexingService(database),
  );
  console.log(
    `${LOG} modo: ${APPLY ? "APPLY (gravando de verdade)" : "DRY-RUN (nada será gravado)"}, motivos: ${INCLUDE_COMPANY_CHANGED ? "job_id_prefix + company_changed" : "só job_id_prefix"}`,
  );

  try {
    const jobs = await prisma.job.findMany({
      where: { slug: { not: null } },
      select: {
        company: { select: { name: true } },
        id: true,
        normalizedTitle: true,
        slug: true,
        status: true,
        title: true,
      },
      orderBy: { id: "asc" },
    });

    const counts = { company_changed: 0, job_id_prefix: 0 };
    let planned = 0;
    let updated = 0;
    let enqueued = 0;
    let failed = 0;

    for (const job of jobs) {
      if (!job.slug) continue;
      const plan = planSlugRegeneration({
        companyName: job.company.name,
        id: job.id,
        normalizedTitle: job.normalizedTitle,
        slug: job.slug,
        title: job.title,
      });
      if (!plan) continue;
      if (!INCLUDE_COMPANY_CHANGED && !plan.reasons.includes("job_id_prefix")) {
        continue;
      }

      planned += 1;
      for (const reason of plan.reasons) counts[reason] += 1;
      console.log(
        `${LOG} [${plan.reasons.join("+")}] status=${job.status} ${job.slug} -> ${plan.baseSlug}`,
      );
      if (!APPLY) continue;

      try {
        await prisma.$transaction(async (tx) => {
          const slug = await buildUniqueSlug(tx, job.id, plan.baseSlug);
          const titleChanged = plan.title !== job.title;
          await tx.job.update({
            where: { id: job.id },
            data: {
              slug,
              ...(titleChanged
                ? {
                    contentUpdatedAt: new Date(),
                    normalizedTitle: plan.normalizedTitle,
                    title: plan.title,
                  }
                : {}),
            },
          });
          if (job.status === "active") {
            enqueued += await indexingQueue.enqueue(
              [
                {
                  priority: INDEXING_PRIORITY.backfill,
                  slug,
                  type: "URL_UPDATED",
                },
              ],
              tx,
            );
          }
        });
        updated += 1;
      } catch (error) {
        failed += 1;
        console.error(
          `${LOG} falhou para ${job.id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    console.log(
      `${LOG} concluído: ${jobs.length} vagas verificadas, ${planned} com slug a regenerar (job_id_prefix=${counts.job_id_prefix}, company_changed=${counts.company_changed})${APPLY ? `, ${updated} gravadas, ${enqueued} enfileiradas na Indexing API, ${failed} falhas` : " (nenhuma gravada: rode com --apply)"}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Mesmo critério de ingestion.service.ts#buildUniqueJobSlug: o cuid no fim
// já torna o slug único, o sufixo _N é só rede de segurança.
async function buildUniqueSlug(
  tx: Prisma.TransactionClient,
  id: string,
  base: string,
) {
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const owner = await tx.job.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!owner || owner.id === id) return candidate;
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
}

main().catch((error) => {
  console.error(`${LOG} fatal error`, error);
  process.exitCode = 1;
});
