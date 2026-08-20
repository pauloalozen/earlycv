// Correção pontual (não parte do pipeline normal) — restaura
// CvAdaptation.jobTitle/companyName (e o JobApplication espelhado) pro
// dado real do Job do radar, quando ficaram como "Não informado" ou nulos
// apesar do Job ter título/empresa reais.
//
// Achado investigando a análise cmt1mc1dn5uq7pq4j7p9vjgk1 (adaptationId):
// startAuthenticatedAnalysisJob resolvia a descrição do radarJobId e
// descartava Job.title/Company.name, dependendo só da IA reextrair do
// texto colado — que raramente repete cargo/empresa no corpo da
// descrição. Corrigido em cv-adaptation.service.ts (processAnalysisJob
// agora prioriza o dado do radar); este script conserta o que já foi
// gravado errado antes do fix.
//
// Por padrão roda em --dry-run. Passe --apply pra gravar de verdade.
//
//   npm run fix:radar-cv-adaptation-job-info --workspace @earlycv/api
//   npm run fix:radar-cv-adaptation-job-info --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

function isMissing(value: string | null): boolean {
  return !value || value === "Não informado";
}

async function main() {
  const prisma = new PrismaClient();
  let checked = 0;
  let fixed = 0;

  console.log(
    `[fix-radar-job-info] modo: ${DRY_RUN ? "DRY-RUN (nada será gravado)" : "APPLY (gravando de verdade)"}`,
  );

  try {
    const applications = await prisma.jobApplication.findMany({
      where: { jobId: { not: null } },
      select: {
        id: true,
        jobTitle: true,
        companyName: true,
        currentCvAdaptationId: true,
        job: { select: { title: true, company: { select: { name: true } } } },
      },
    });

    for (const app of applications) {
      checked += 1;
      const radarTitle = app.job?.title || null;
      const radarCompany = app.job?.company?.name || null;

      const patch: Record<string, string> = {};
      if (radarTitle && isMissing(app.jobTitle)) patch.jobTitle = radarTitle;
      if (radarCompany && isMissing(app.companyName)) {
        patch.companyName = radarCompany;
      }

      if (Object.keys(patch).length === 0) continue;

      fixed += 1;
      console.log(
        `[fix-radar-job-info] JobApplication ${app.id}: ${JSON.stringify(patch)}`,
      );

      if (!DRY_RUN) {
        await prisma.jobApplication.update({
          where: { id: app.id },
          data: patch,
        });
        // Cobre tanto a adaptação "atual" quanto qualquer outra ligada à
        // mesma candidatura (CvAdaptation.jobApplicationId) — uma
        // candidatura pode ter mais de uma adaptação ao longo do tempo.
        // NUNCA passar id undefined pro OR — o Prisma descarta a chave e
        // o filtro vira "sem restrição", atualizando a tabela inteira.
        const idFilters: Array<{ id: string } | { jobApplicationId: string }> =
          [{ jobApplicationId: app.id }];
        if (app.currentCvAdaptationId) {
          idFilters.push({ id: app.currentCvAdaptationId });
        }
        await prisma.cvAdaptation.updateMany({
          where: { OR: idFilters },
          data: patch,
        });
      }
    }

    console.log(
      `[fix-radar-job-info] concluído: ${checked} candidaturas via radar verificadas, ${fixed} corrigidas`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[fix-radar-job-info] fatal error", error);
  process.exitCode = 1;
});
