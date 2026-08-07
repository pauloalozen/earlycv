import { PrismaClient } from "@prisma/client";

import { buildPublicJobSlug } from "../jobs/public-job-view";

// Sprint 5 (Radar público) adicionou Job.slug como campo persistido — antes
// disso o slug era só calculado em runtime a cada request. Este script
// preenche o slug de toda vaga que ainda não tem (criada antes da migration
// que adicionou o campo). Rodar uma única vez, manualmente, depois da
// migration:
//
//   npx tsx apps/api/src/scripts/backfill-job-slugs.ts
//
// Idempotente: só processa Job com slug nulo, então pode ser rodado de novo
// com segurança caso falhe no meio.
//
// Sem colisão real esperada: o slug termina no id do Job (cuid, único por
// construção), então dois Jobs nunca produzem o mesmo slug completo — o
// sufixo _2/_3 abaixo é só uma rede de segurança, igual ao critério usado em
// ingestion.service.ts na criação de vagas novas.
async function buildUniqueSlug(
  prisma: PrismaClient,
  id: string,
  title: string,
  company: string,
) {
  const base = buildPublicJobSlug(id, title, company);
  let candidate = base;
  let suffix = 2;

  while (
    await prisma.job.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
  ) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function main() {
  const prisma = new PrismaClient();
  let backfilled = 0;
  let failed = 0;

  try {
    const jobs = await prisma.job.findMany({
      where: { slug: null },
      select: { id: true, title: true, company: { select: { name: true } } },
    });

    console.log(`[backfill-job-slugs] found ${jobs.length} jobs without slug`);

    for (const job of jobs) {
      try {
        const slug = await buildUniqueSlug(
          prisma,
          job.id,
          job.title,
          job.company.name,
        );
        await prisma.job.update({
          where: { id: job.id },
          data: { slug },
        });
        backfilled += 1;
      } catch (error) {
        failed += 1;
        console.error(
          `[backfill-job-slugs] failed for ${job.id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    console.log(
      `[backfill-job-slugs] done — backfilled=${backfilled} failed=${failed}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[backfill-job-slugs] fatal error", error);
  process.exitCode = 1;
});
