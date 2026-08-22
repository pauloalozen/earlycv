// Aplica as linhas de JobSourceAudit com status="approved" — gerado por
// audit-company-sources.ts e revisado manualmente (ver AGENTS.md/runbook de
// saneamento de fontes). Nunca toca em linha "pending"/"rejected"/"applied".
//
// Regras por tier (field="sourceUrl", JobSource envolvida):
//   - Sempre desativa a JobSource errada (isActive=false + pauseReason),
//     pra parar de crawlear e a descoberta nao tentar de novo.
//   - tier="confirmed": se a Company sugerida como dona real (
//     suspectedOwnerId) ja tiver uma JobSource ativa com essa MESMA
//     sourceUrl (ou seja, ela ja e corretamente crawleada por la), as vagas
//     ja importadas pela fonte errada sao REATRIBUIDAS pra essa
//     Company/JobSource certa — o dado da vaga e real, so o dono estava
//     errado. Sem esse destino certo pra mover (dona real ainda nao tem
//     fonte propria cadastrada), as vagas viram status="removed": nao da
//     pra inventar uma JobSource nova por conta propria (config de
//     adapter/parser e decisao de negocio, nao algo que este script deve
//     assumir sozinho).
//   - tier="high"/"review": sem dono conhecido no nosso banco — as vagas
//     ja importadas por essa fonte viram status="removed" (nao aparecem
//     mais no radar sob o nome errado, mas o registro fica pra auditoria).
//
// Regras por tier (field="careersUrl"/"websiteUrl", so metadado da Company,
// sem JobSource/Job envolvidos):
//   - Zera o campo (fica null) na Company.
//
// A Company do achado NUNCA e desativada por este script — ela continua
// valendo como alvo pra descoberta encontrar a fonte real dela depois.
//
// Por padrao roda em --dry-run (so imprime o que faria). Passe --apply pra
// gravar de verdade.
//
//   npm run apply:company-source-audit --workspace @earlycv/api
//   npm run apply:company-source-audit --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

async function main() {
  const prisma = new PrismaClient();
  try {
    const approved = await prisma.jobSourceAudit.findMany({
      where: { status: "approved" },
      orderBy: { detectedAt: "asc" },
    });

    console.log(
      `[apply-company-source-audit] modo: ${DRY_RUN ? "DRY-RUN (nada será gravado)" : "APPLY (gravando de verdade)"} — ${approved.length} linha(s) approved.`,
    );

    let jobSourcesDisabled = 0;
    let jobsRemoved = 0;
    let jobsReassigned = 0;
    let companyFieldsCleared = 0;

    for (const audit of approved) {
      if (audit.field === "careersUrl" || audit.field === "websiteUrl") {
        console.log(
          `  [Company ${audit.companyId}] limpar ${audit.field} (era: ${audit.currentUrl})`,
        );
        if (!DRY_RUN) {
          await prisma.company.update({
            where: { id: audit.companyId },
            data: { [audit.field]: null },
          });
        }
        companyFieldsCleared += 1;
        await markApplied(prisma, audit.id, DRY_RUN);
        continue;
      }

      // field === "sourceUrl"
      if (!audit.jobSourceId) {
        console.warn(
          `  [skip] audit ${audit.id} tem field=sourceUrl mas jobSourceId nulo — inconsistente, pulando`,
        );
        continue;
      }

      console.log(
        `  [JobSource ${audit.jobSourceId}] desativar (era ativa em Company ${audit.companyId}, url: ${audit.currentUrl})`,
      );
      if (!DRY_RUN) {
        await prisma.jobSource.update({
          where: { id: audit.jobSourceId },
          data: {
            isActive: false,
            pauseReason: `saneamento-fontes: URL nao pertence a esta empresa (auditoria ${audit.id}, tier=${audit.tier})`,
          },
        });
      }
      jobSourcesDisabled += 1;

      let destination: { companyId: string; jobSourceId: string } | null = null;

      if (audit.tier === "confirmed" && audit.suspectedOwnerId) {
        const correctSource = await prisma.jobSource.findFirst({
          where: {
            companyId: audit.suspectedOwnerId,
            sourceUrl: audit.currentUrl,
            isActive: true,
          },
        });
        if (correctSource) {
          destination = {
            companyId: audit.suspectedOwnerId,
            jobSourceId: correctSource.id,
          };
        }
      }

      if (destination) {
        console.log(
          `    -> reatribuindo vagas dessa fonte pra Company ${destination.companyId} / JobSource ${destination.jobSourceId}`,
        );
        if (!DRY_RUN) {
          const result = await prisma.job.updateMany({
            where: { jobSourceId: audit.jobSourceId },
            data: {
              companyId: destination.companyId,
              jobSourceId: destination.jobSourceId,
            },
          });
          jobsReassigned += result.count;
        } else {
          const count = await prisma.job.count({
            where: { jobSourceId: audit.jobSourceId },
          });
          jobsReassigned += count;
        }
      } else {
        console.log(
          "    -> sem destino certo cadastrado; marcando vagas como removed",
        );
        if (!DRY_RUN) {
          const result = await prisma.job.updateMany({
            where: {
              jobSourceId: audit.jobSourceId,
              status: { not: "removed" },
            },
            data: { status: "removed" },
          });
          jobsRemoved += result.count;
        } else {
          const count = await prisma.job.count({
            where: {
              jobSourceId: audit.jobSourceId,
              status: { not: "removed" },
            },
          });
          jobsRemoved += count;
        }
      }

      await markApplied(prisma, audit.id, DRY_RUN);
    }

    console.log(
      `[apply-company-source-audit] resumo: ${jobSourcesDisabled} fonte(s) desativada(s), ${companyFieldsCleared} campo(s) de Company limpo(s), ${jobsReassigned} vaga(s) reatribuida(s), ${jobsRemoved} vaga(s) marcada(s) como removed.`,
    );
    if (DRY_RUN) {
      console.log(
        "[apply-company-source-audit] nada foi gravado (dry-run). Rode com --apply pra aplicar de verdade.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function markApplied(prisma: PrismaClient, id: string, dryRun: boolean) {
  if (dryRun) return;
  await prisma.jobSourceAudit.update({
    where: { id },
    data: { status: "applied", appliedAt: new Date() },
  });
}

main().catch((error: unknown) => {
  console.error("[apply-company-source-audit] falhou:", error);
  process.exitCode = 1;
});
