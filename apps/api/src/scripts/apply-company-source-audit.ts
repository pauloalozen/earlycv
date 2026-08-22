// Aplica as linhas de JobSourceAudit com status="approved" — gerado por
// audit-company-sources.ts (ou pelo botão "Rodar auditoria" da aba "Audit
// de Fontes" em /admin/ingestion) e revisado manualmente. Nunca toca em
// linha "pending"/"rejected"/"applied".
//
// Regras por tier: ver o comentario em CompanySourceAuditService
// (apps/api/src/ingestion/company-source-audit.service.ts) — mesma logica
// usada pelo endpoint admin, so um wrapper de terminal em cima dela.
//
// Por padrao roda em --dry-run (so imprime o que faria). Passe --apply pra
// gravar de verdade.
//
//   npm run apply:company-source-audit --workspace @earlycv/api
//   npm run apply:company-source-audit --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";
import type { DatabaseService } from "../database/database.service";
import { CompanySourceAuditService } from "../ingestion/company-source-audit.service";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

async function main() {
  const prisma = new PrismaClient();
  try {
    const service = new CompanySourceAuditService(
      prisma as unknown as DatabaseService,
    );
    console.log(
      `[apply-company-source-audit] modo: ${DRY_RUN ? "DRY-RUN (nada será gravado)" : "APPLY (gravando de verdade)"}`,
    );
    const summary = await service.applyApproved({ dryRun: DRY_RUN });
    console.log(
      `[apply-company-source-audit] ${summary.processed} linha(s) approved processada(s) — ${summary.jobSourcesDisabled} fonte(s) desativada(s), ${summary.jobSourcesCreated} fonte(s) nova(s) criada(s), ${summary.companiesCreated} empresa(s) rascunho criada(s), ${summary.companyFieldsCleared} campo(s) de Company limpo(s), ${summary.jobsReassigned} vaga(s) reatribuida(s), ${summary.jobsRemoved} vaga(s) marcada(s) como removed.`,
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

main().catch((error: unknown) => {
  console.error("[apply-company-source-audit] falhou:", error);
  process.exitCode = 1;
});
