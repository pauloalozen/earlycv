// Reparo do bug achado em 2026-09-28: PlansService.applyApprovedPurchaseInsideTransaction
// sempre marcava a adaptação como isUnlocked=true/status="paid" no auto-unlock
// via compra de plano (webhook Mercado Pago, originAction="unlock_cv"), mas
// nunca chamava CvAdaptationService.deliverAdaptation — a única função que
// cria o Resume final e vira status="delivered". Só o fluxo de resgate por
// crédito chamava deliverAdaptation. O código já foi corrigido
// (plans.service.ts) pra compras novas; este script repara as que já
// ficaram presas.
//
// Dois grupos, tratados diferente:
//
// A) "adaptedResumeId" e "aiAuditJson" já preenchidos — o usuário muito
//    provavelmente já baixou o PDF/DOCX em algum momento (ensureAdaptedResumeRecord/
//    ensureLegacyStructuredOutput rodam lazy no download, fora do
//    deliverAdaptation). Nesse caso o conteúdo já existe e está correto — só
//    falta o campo status virar "delivered" pra tela /adaptacao-cv/:id parar
//    de mostrar o skeleton de geração pra sempre. Reparo: update direto,
//    sem IA, sem duplicar Resume.
//
// B) Nem "adaptedResumeId" nem "aiAuditJson" existem — a adaptação nunca foi
//    de fato entregue (nem baixada). Precisa rodar o pipeline real:
//    CvAdaptationService.deliverAdaptation(id) (cria o Resume, gera o
//    conteúdo estruturado via IA quando necessário, aí sim marca
//    "delivered"). Só roda com --apply-full (flag separada — tem custo de
//    IA e é bem mais pesado que o reparo A).
//
// Por padrão roda em --dry-run (só lista os dois grupos e contagens).
//
//   npm run fix:stuck-unlock-cv-delivery --workspace @earlycv/api
//   npm run fix:stuck-unlock-cv-delivery --workspace @earlycv/api -- --apply
//   npm run fix:stuck-unlock-cv-delivery --workspace @earlycv/api -- --apply --apply-full
//   // --ids restringe o grupo B a uma lista (smoke test antes do lote todo):
//   npm run fix:stuck-unlock-cv-delivery --workspace @earlycv/api -- --apply --apply-full --ids=id1,id2,id3

import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";

import { CvAdaptationModule } from "../cv-adaptation/cv-adaptation.module";
import { CvAdaptationService } from "../cv-adaptation/cv-adaptation.service";

const APPLY = process.argv.includes("--apply");
const APPLY_FULL = process.argv.includes("--apply-full");
const IDS_ARG = process.argv.find((arg) => arg.startsWith("--ids="));
const ONLY_IDS = IDS_ARG
  ? new Set(
      IDS_ARG.slice("--ids=".length)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    )
  : null;

async function main() {
  const prisma = new PrismaClient();

  try {
    const completedUnlockPurchases = await prisma.planPurchase.findMany({
      where: {
        originAction: "unlock_cv",
        status: "completed",
        originAdaptationId: { not: null },
      },
      select: { originAdaptationId: true },
    });
    const candidateIds = Array.from(
      new Set(
        completedUnlockPurchases
          .map((p) => p.originAdaptationId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const stuck = await prisma.cvAdaptation.findMany({
      where: {
        id: { in: candidateIds },
        status: { not: "delivered" },
        isUnlocked: true,
      },
      select: {
        id: true,
        userId: true,
        status: true,
        adaptedResumeId: true,
        aiAuditJson: true,
      },
    });

    const groupA = stuck.filter(
      (a) => a.adaptedResumeId && a.aiAuditJson !== null,
    );
    const groupBFull = stuck.filter(
      (a) => !a.adaptedResumeId || a.aiAuditJson === null,
    );
    const groupB = ONLY_IDS
      ? groupBFull.filter((a) => ONLY_IDS.has(a.id))
      : groupBFull;

    console.log(`Total travados: ${stuck.length}`);
    console.log(
      `Grupo A (só flip de status, conteúdo já existe): ${groupA.length}`,
    );
    console.log(
      `Grupo B (precisa gerar de verdade, via IA): ${groupBFull.length}` +
        (ONLY_IDS ? ` — rodando só ${groupB.length} (--ids)` : ""),
    );
    for (const a of groupBFull) {
      console.log(
        `  B: ${a.id} (user ${a.userId})${ONLY_IDS && !ONLY_IDS.has(a.id) ? " [pulado, fora de --ids]" : ""}`,
      );
    }

    if (!APPLY) {
      console.log("\n--dry-run (nada gravado). Rode com --apply pra aplicar o grupo A.");
      return;
    }

    if (groupA.length > 0) {
      const result = await prisma.cvAdaptation.updateMany({
        where: { id: { in: groupA.map((a) => a.id) } },
        data: { status: "delivered" },
      });
      console.log(`Grupo A reparado: ${result.count} adaptações.`);
    }

    if (groupB.length === 0) {
      return;
    }

    if (!APPLY_FULL) {
      console.log(
        `\nGrupo B (${groupB.length}) não reparado — precisa gerar conteúdo via IA. Rode com --apply-full pra reparar também esse grupo.`,
      );
      return;
    }

    const app = await NestFactory.createApplicationContext(CvAdaptationModule, {
      logger: ["error", "warn"],
    });
    const cvAdaptationService = app.get(CvAdaptationService);

    let ok = 0;
    let failed = 0;
    for (const a of groupB) {
      try {
        await cvAdaptationService.deliverAdaptation(a.id);
        ok += 1;
        console.log(`  ok: ${a.id}`);
      } catch (err) {
        failed += 1;
        console.error(
          `  falhou: ${a.id} — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    console.log(`Grupo B: ${ok} reparados, ${failed} falharam.`);

    await app.close();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
