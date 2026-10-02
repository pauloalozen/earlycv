// Correção pontual (não parte do pipeline normal) — completa o link de
// origem das vagas InHire que foram gravadas sem o segmento de slug.
//
// O InHireAdapter montava `https://{tenant}.inhire.app/vagas/{jobId}`, mas a
// página pública do InHire é uma SPA cuja rota é `/vagas/:jobId/:jobSlug`:
// sem o slug ela não renderiza nada. Corrigido no adapter
// (buildInHireJobUrl). Vagas ainda ativas se corrigem sozinhas no próximo
// crawl (o upsert sempre reescreve sourceJobUrl, inclusive em observação
// leve); este script cobre o que o crawl não alcança mais:
//   - Job.sourceJobUrl de vagas que já saíram da listagem (inativas);
//   - JobApplication.jobUrl, que é uma cópia de Job.sourceJobUrl feita na
//     criação da candidatura e nunca é reatualizada. Só troca quando o valor
//     ainda é exatamente o link quebrado — se o usuário editou, não toca.
//
// Por padrão roda em --dry-run. Passe --apply pra gravar de verdade.
//
//   npm run fix:inhire-job-urls --workspace @earlycv/api
//   npm run fix:inhire-job-urls --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";
import { buildInHireJobSlug } from "../ingestion/adapters/inhire.adapter";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const PAGE_SIZE = 500;

// Link sem slug: termina logo depois do jobId.
const BROKEN_URL = /^https:\/\/[a-z0-9-]+\.inhire\.app\/vagas\/[^/?#]+$/;

async function main() {
  const prisma = new PrismaClient();
  let checkedJobs = 0;
  let fixedJobs = 0;
  let fixedApplications = 0;

  console.log(
    `[fix-inhire-job-urls] modo: ${DRY_RUN ? "DRY-RUN (nada será gravado)" : "APPLY (gravando de verdade)"}`,
  );

  try {
    let cursor: string | undefined;

    for (;;) {
      const jobs = await prisma.job.findMany({
        where: { sourceJobUrl: { contains: ".inhire.app/vagas/" } },
        select: { id: true, title: true, sourceJobUrl: true },
        orderBy: { id: "asc" },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (jobs.length === 0) break;
      cursor = jobs[jobs.length - 1]?.id;

      for (const job of jobs) {
        checkedJobs += 1;
        if (!BROKEN_URL.test(job.sourceJobUrl)) continue;

        const brokenUrl = job.sourceJobUrl;
        const fixedUrl = `${brokenUrl}/${buildInHireJobSlug(job.title)}`;
        const applications = await prisma.jobApplication.findMany({
          where: { jobId: job.id, jobUrl: brokenUrl },
          select: { id: true },
        });

        fixedJobs += 1;
        fixedApplications += applications.length;
        console.log(
          `[fix-inhire-job-urls] Job ${job.id}: ${brokenUrl} -> ${fixedUrl} (candidaturas: ${applications.length})`,
        );

        if (!DRY_RUN) {
          await prisma.$transaction([
            prisma.job.update({
              where: { id: job.id },
              data: { sourceJobUrl: fixedUrl },
            }),
            prisma.jobApplication.updateMany({
              where: { jobId: job.id, jobUrl: brokenUrl },
              data: { jobUrl: fixedUrl },
            }),
          ]);
        }
      }
    }

    console.log(
      `[fix-inhire-job-urls] vagas InHire verificadas: ${checkedJobs}, vagas corrigidas: ${fixedJobs}, candidaturas corrigidas: ${fixedApplications}${DRY_RUN ? " (dry-run)" : ""}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
