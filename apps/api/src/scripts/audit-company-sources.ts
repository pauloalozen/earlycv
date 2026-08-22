// Saneamento de fontes: varre Company.websiteUrl/careersUrl e
// JobSource.sourceUrl e grava em JobSourceAudit qualquer caso onde a URL
// nao tem relacao textual plausivel com o nome da empresa dona do registro
// — o bug que motivou isso foi "VERACEL" (usina de celulose) com
// careersUrl apontando pro board de vagas da "Vercel" (empresa de infra).
//
// So LEITURA + upsert na fila de revisao (JobSourceAudit) — nao mexe em
// Company/JobSource/Job. A aplicacao de qualquer correcao e feita por
// apply-company-source-audit.ts, e so depois de voce marcar status=approved
// nas linhas que fizerem sentido (via SQL, ou pela aba "Audit de Fontes" em
// /admin/ingestion).
//
// Tiers: ver o comentario em CompanySourceAuditService.runAudit()
// (apps/api/src/ingestion/company-source-audit.service.ts) — essa e a
// mesma logica usada pelo endpoint admin, so um wrapper de terminal em
// cima dela.
//
// Idempotente: roda de novo quantas vezes quiser, so grava achado novo ou
// atualiza um "pending" existente — nunca sobrescreve uma linha que voce ja
// revisou (approved/rejected/applied).
//
//   npm run audit:company-sources --workspace @earlycv/api

import { PrismaClient } from "@prisma/client";
import type { DatabaseService } from "../database/database.service";
import { CompanySourceAuditService } from "../ingestion/company-source-audit.service";

async function main() {
  const prisma = new PrismaClient();
  try {
    const service = new CompanySourceAuditService(
      prisma as unknown as DatabaseService,
    );
    const summary = await service.runAudit();
    console.log(
      `[audit-company-sources] ${summary.found} achado(s) — ${summary.created} novo(s), ${summary.updated} atualizado(s) (pending), ${summary.skippedReviewed} ja revisado(s) (mantidos como estao).`,
    );
    console.log(
      '[audit-company-sources] revise via SQL ou na aba "Audit de Fontes" em /admin/ingestion:',
    );
    console.log(
      "  SELECT * FROM \"JobSourceAudit\" WHERE status='pending' ORDER BY tier, confidence;",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("[audit-company-sources] falhou:", error);
  process.exitCode = 1;
});
