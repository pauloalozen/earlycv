// PR 2b (decisão F + talent pool por título): normaliza Job.employmentType
// das vagas já gravadas, guardando o valor antigo em employmentTypeRaw
// quando ele ainda está vazio. Mesma regra da ingestão
// (resolveEmploymentType): vaga com "banco de talentos" no título vira
// talent_pool, "Homeoffice" e valor desconhecido ficam sem tipo.
//
// Fila da Indexing API: só vaga ativa que passou de "sem JobPosting" para
// "com JobPosting" (shouldEmitJobPosting) ganha URL_UPDATED. A que só mudou
// o tipo visível ganha contentUpdatedAt (o sitemap avisa o Google); a que
// só ganhou employmentTypeRaw não muda nada na página.
//
// Por padrão roda em --dry-run (só lê e reporta, inclusive quantas
// pendências vai criar). Passe --apply pra gravar. Idempotente: rodar de
// novo não muda nada.
//
//   npm run jobs:normalize-employment-types --workspace @earlycv/api
//   npm run jobs:normalize-employment-types --workspace @earlycv/api -- --apply

import { shouldEmitJobPosting } from "@earlycv/config/job-posting";
import { PrismaClient } from "@prisma/client";

import type { DatabaseService } from "../database/database.service";
import { GoogleIndexingService } from "../google-indexing/google-indexing.service";
import {
  GoogleIndexingQueueService,
  INDEXING_PRIORITY,
  JOB_POSTING_ELIGIBILITY_SELECT,
} from "../google-indexing/google-indexing-queue.service";
import { resolveEmploymentType } from "../ingestion/employment-type";

const APPLY = process.argv.includes("--apply");
const LOG = "[normalize-employment-types]";
const CHUNK = 500;

async function main() {
  const prisma = new PrismaClient();
  console.log(
    `${LOG} modo: ${APPLY ? "APPLY (gravando de verdade)" : "DRY-RUN (nada será gravado)"}`,
  );

  try {
    const jobs = await prisma.job.findMany({
      select: {
        ...JOB_POSTING_ELIGIBILITY_SELECT,
        employmentTypeRaw: true,
        id: true,
        slug: true,
        status: true,
        title: true,
      },
      orderBy: { id: "asc" },
    });

    // Agrupa por (antes -> depois) para o relatório e para gravar com
    // updateMany por grupo, em vez de um update por vaga.
    const groups = new Map<
      string,
      {
        active: number;
        employmentType: string | null;
        employmentTypeRaw: string | null;
        from: string | null;
        ids: string[];
        visible: boolean;
      }
    >();
    // Ativas que passam a ter JobPosting: as únicas que vão para a fila.
    const gainedJobPosting: string[] = [];
    for (const job of jobs) {
      const next = resolveEmploymentType({
        employmentType: job.employmentType,
        employmentTypeRaw: job.employmentTypeRaw,
        title: job.title,
      });
      if (
        next.employmentType === job.employmentType &&
        next.employmentTypeRaw === job.employmentTypeRaw
      ) {
        continue;
      }
      const visible = next.employmentType !== job.employmentType;
      if (
        visible &&
        job.status === "active" &&
        job.slug &&
        !shouldEmitJobPosting(job) &&
        shouldEmitJobPosting({ ...job, employmentType: next.employmentType })
      ) {
        gainedJobPosting.push(job.slug);
      }
      const key = JSON.stringify([
        job.employmentType,
        next.employmentType,
        next.employmentTypeRaw,
      ]);
      const group = groups.get(key) ?? {
        active: 0,
        employmentType: next.employmentType,
        employmentTypeRaw: next.employmentTypeRaw,
        from: job.employmentType,
        ids: [],
        visible,
      };
      group.ids.push(job.id);
      if (job.status === "active") group.active += 1;
      groups.set(key, group);
    }

    const summary = new Map<string, { total: number; active: number }>();
    for (const group of groups.values()) {
      const label = `${group.from ?? "<null>"} -> ${group.employmentType ?? "<null>"}`;
      const entry = summary.get(label) ?? { active: 0, total: 0 };
      entry.total += group.ids.length;
      entry.active += group.active;
      summary.set(label, entry);
    }
    for (const [label, entry] of [...summary.entries()].sort(
      (a, b) => b[1].total - a[1].total,
    )) {
      console.log(`${LOG} ${label}: ${entry.total} (ativas: ${entry.active})`);
    }

    let updated = 0;
    let enqueued = 0;
    if (APPLY) {
      const now = new Date();
      for (const group of groups.values()) {
        for (let i = 0; i < group.ids.length; i += CHUNK) {
          const result = await prisma.job.updateMany({
            where: { id: { in: group.ids.slice(i, i + CHUNK) } },
            data: {
              employmentType: group.employmentType,
              employmentTypeRaw: group.employmentTypeRaw,
              ...(group.visible ? { contentUpdatedAt: now } : {}),
            },
          });
          updated += result.count;
        }
      }
      const database = prisma as unknown as DatabaseService;
      enqueued = await new GoogleIndexingQueueService(
        database,
        new GoogleIndexingService(database),
      ).enqueue(
        gainedJobPosting.map((slug) => ({
          priority: INDEXING_PRIORITY.backfill,
          slug,
          type: "URL_UPDATED" as const,
        })),
      );
    }

    const changed = [...groups.values()].reduce(
      (sum, group) => sum + group.ids.length,
      0,
    );
    const visibleChanged = [...groups.values()]
      .filter((group) => group.visible)
      .reduce((sum, group) => sum + group.ids.length, 0);
    console.log(
      `${LOG} concluído: ${jobs.length} vagas verificadas, ${changed} a normalizar (${visibleChanged} com tipo visível alterado ganham contentUpdatedAt), ${gainedJobPosting.length} pendências URL_UPDATED na Indexing API (ativas que passam a ter JobPosting)${APPLY ? `; ${updated} gravadas, ${enqueued} enfileiradas` : " (nenhuma gravada: rode com --apply)"}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`${LOG} fatal error`, error);
  process.exitCode = 1;
});
