// Wrapper de terminal pra ForeignJobsCleanupService — mesma lógica usada
// pela aba admin "Vagas Estrangeiras" em /admin/ingestion (ver
// foreign-jobs-cleanup.service.ts pro contexto completo do saneamento).
// Útil pra investigar localmente sem precisar subir a API; em produção,
// use a aba admin (não rode este script direto contra prod).
//
// Por padrão roda em --dry-run (só lê e reporta, nunca escreve). Passe
// --apply pra gravar de verdade.
//
//   npm run cleanup:foreign-jobs --workspace @earlycv/api
//   npm run cleanup:foreign-jobs --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";

import type { DatabaseService } from "../database/database.service";
import { ForeignJobsCleanupService } from "../ingestion/foreign-jobs-cleanup.service";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

async function main() {
  const prisma = new PrismaClient();
  console.log(
    `[cleanup-foreign-jobs] modo: ${DRY_RUN ? "DRY-RUN (nada será gravado)" : "APPLY (gravando de verdade)"}`,
  );

  try {
    const service = new ForeignJobsCleanupService(
      prisma as unknown as DatabaseService,
    );
    const { checked, foreign, ambiguous } = await service.preview();

    for (const finding of foreign) {
      console.log(
        `[cleanup-foreign-jobs] ${finding.companyName} — "${finding.title}" (country=${finding.country ?? "null"}, state=${finding.state ?? "null"}, status=${finding.status}, fonte=${finding.sourceUrl ?? "sem fonte"})`,
      );
    }
    for (const finding of ambiguous) {
      console.log(
        `[cleanup-foreign-jobs][AMBIGUO — não removido] ${finding.companyName} — "${finding.title}" (country=${finding.country ?? "null"}, state=${finding.state ?? "null"}, status=${finding.status}, fonte=${finding.sourceUrl ?? "sem fonte"})`,
      );
    }

    if (!DRY_RUN) {
      const summary = await service.apply({ dryRun: false });
      console.log(
        `[cleanup-foreign-jobs] concluído: ${checked} vagas verificadas, ${summary.removed} fechadas (status=removed), ${summary.skippedAmbiguous} ambígua(s) não tocada(s).`,
      );
    } else {
      console.log(
        `[cleanup-foreign-jobs] concluído: ${checked} vagas verificadas, ${foreign.length} estrangeiras encontradas (nenhuma gravada — rode com --apply), ${ambiguous.length} ambígua(s) com UF brasileira isolada no campo country (não tocadas, revisar manualmente).`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[cleanup-foreign-jobs] fatal error", error);
  process.exitCode = 1;
});
