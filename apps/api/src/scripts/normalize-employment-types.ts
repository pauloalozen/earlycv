// PR 2b (decisão F + talent pool por título): normaliza Job.employmentType
// das vagas já gravadas, guardando o valor antigo em employmentTypeRaw
// quando ele ainda está vazio. Mesma regra da ingestão
// (resolveEmploymentType): vaga com "banco de talentos" no título vira
// talent_pool, "Homeoffice" e valor desconhecido ficam sem tipo.
//
// Por padrão roda em --dry-run (só lê e reporta). Passe --apply pra gravar.
// Idempotente: rodar de novo não muda nada.
//
//   npm run jobs:normalize-employment-types --workspace @earlycv/api
//   npm run jobs:normalize-employment-types --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";

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
        employmentType: true,
        employmentTypeRaw: true,
        id: true,
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
      }
    >();
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
    if (APPLY) {
      for (const group of groups.values()) {
        for (let i = 0; i < group.ids.length; i += CHUNK) {
          const result = await prisma.job.updateMany({
            where: { id: { in: group.ids.slice(i, i + CHUNK) } },
            data: {
              employmentType: group.employmentType,
              employmentTypeRaw: group.employmentTypeRaw,
            },
          });
          updated += result.count;
        }
      }
    }

    const changed = [...groups.values()].reduce(
      (sum, group) => sum + group.ids.length,
      0,
    );
    console.log(
      `${LOG} concluído: ${jobs.length} vagas verificadas, ${changed} a normalizar${APPLY ? `, ${updated} gravadas` : " (nenhuma gravada: rode com --apply)"}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`${LOG} fatal error`, error);
  process.exitCode = 1;
});
