// Corrige fontes gupy/pandape/teamtailor/solides atribuidas a empresa errada
// (mesmo bug do caso que motivou isso: "ITAQUI ENERGIA" com sourceUrl
// solargrid.gupy.io — a fonte e as vagas eram da Solar Grid, nao da Itaqui).
//
// Achados nesse formato NAO passam pelo heuristico de
// company-source-audit-heuristics.ts (gupy/pandape/teamtailor/solides sao
// excluidos dele de proposito — ver comentario em STRICT_LITERAL_SLUG_HOSTS)
// entao vieram de uma auditoria manual separada: cruzar o token de
// identidade da URL contra o texto real das vagas, revisado linha a linha
// por voce no CSV em src/scripts/data/2026-09-17-source-company-mismatches.csv.
//
// Para cada linha do CSV (companyId/jobSourceId = os ERRADOS, matchedToken =
// identidade real extraida da URL):
//   1. Acha (ou cria) a Company dona de verdade — nome = titleCase(token),
//      mesma convencao ja usada pelos rascunhos de
//      CompanySourceAuditService.applyApproved() (ex: "Doordashusa").
//      Se ja existir mas estiver isActive=false (rascunho antigo), reativa.
//   2. Acha (ou cria, copiando parserKey/sourceType/crawlStrategy/
//      checkIntervalMinutes/schedule da fonte errada) a JobSource certa
//      com essa sourceUrl, e garante isActive=true + scheduleEnabled=true.
//   3. Move (Job.updateMany) todas as vagas da fonte errada pra
//      companyId/jobSourceId certos — preserva status como estava.
//   4. Pausa a fonte errada (isActive=false, scheduleEnabled=false,
//      pauseReason) e EXCLUI a linha (agora sem nenhuma vaga presa nela —
//      Job.jobSourceId e SetNull, mas ja nao ha nenhuma vaga apontando pra
//      ela depois do passo 3).
//   5. Se a Company errada nao sobrou com nenhuma outra fonte nem vaga,
//      marca isActive=false. Nunca desativa uma Company que ainda tenha
//      outra fonte/vaga legitima.
//
// So-leitura vira grava quando DRY_RUN=false (ou --apply). Sem --apply,
// so imprime o que faria. Idempotente: rodar de novo depois de aplicado so
// pula as linhas cuja fonte errada ja nao existe mais (ja corrigidas).
//
//   npm run fix:mismatched-sources --workspace @earlycv/api           # dry-run
//   npm run fix:mismatched-sources --workspace @earlycv/api -- --apply

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { normalizeCompanyName } from "../ingestion/name-normalization";
import { canonicalizeSourceUrl } from "../ingestion/url-normalization";

const DEFAULT_CSV_PATH = join(
  __dirname,
  "data/2026-09-17-source-company-mismatches.csv",
);

const APPLY =
  process.argv.includes("--apply") || process.env.DRY_RUN === "false";
const DRY_RUN = !APPLY;

type CsvRow = {
  companyId: string;
  companyName: string;
  sourceUrl: string;
  matchedToken: string;
  jobSourceId: string;
};

// Parser CSV minimo (RFC4180: campo entre aspas pode conter virgula/quebra
// de linha, "" escapa aspas literal) — suficiente pro arquivo gerado pela
// auditoria, sem trazer dependencia externa so pra isso.
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

function loadRows(csvPath: string): CsvRow[] {
  const content = readFileSync(csvPath, "utf8");
  const [header, ...lines] = parseCsv(content);
  if (!header) return [];
  const idx = {
    companyId: header.indexOf("companyId"),
    companyName: header.indexOf("companyName"),
    sourceUrl: header.indexOf("sourceUrl"),
    matchedToken: header.indexOf("matchedToken"),
    jobSourceId: header.indexOf("jobSourceId"),
  };
  for (const [key, value] of Object.entries(idx)) {
    if (value === -1) {
      throw new Error(`coluna "${key}" nao encontrada no CSV`);
    }
  }
  return lines.map((cols) => ({
    companyId: cols[idx.companyId] ?? "",
    companyName: cols[idx.companyName] ?? "",
    sourceUrl: cols[idx.sourceUrl] ?? "",
    matchedToken: cols[idx.matchedToken] ?? "",
    jobSourceId: cols[idx.jobSourceId] ?? "",
  }));
}

function titleCase(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

type Summary = {
  processed: number;
  skippedAlreadyFixed: number;
  skippedStale: number;
  companiesCreated: number;
  companiesReactivated: number;
  sourcesCreated: number;
  sourcesReused: number;
  jobsMoved: number;
  wrongSourcesDeleted: number;
  wrongCompaniesDeactivated: number;
  errors: number;
};

async function main() {
  const csvPath =
    process.argv.find((a) => a.startsWith("--csv="))?.slice(6) ??
    DEFAULT_CSV_PATH;
  const rows = loadRows(csvPath);

  console.log(
    `[fix-mismatched-sources] ${rows.length} linha(s) no CSV — modo ${DRY_RUN ? "DRY-RUN (nada sera gravado)" : "APLICANDO"}.`,
  );

  const prisma = new PrismaClient();
  const summary: Summary = {
    processed: 0,
    skippedAlreadyFixed: 0,
    skippedStale: 0,
    companiesCreated: 0,
    companiesReactivated: 0,
    sourcesCreated: 0,
    sourcesReused: 0,
    jobsMoved: 0,
    wrongSourcesDeleted: 0,
    wrongCompaniesDeactivated: 0,
    errors: 0,
  };

  try {
    for (const row of rows) {
      try {
        await processRow(prisma, row, summary);
      } catch (error) {
        summary.errors += 1;
        console.error(
          `[fix-mismatched-sources] erro na linha (jobSourceId=${row.jobSourceId}, empresa errada="${row.companyName}"):`,
          error,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("[fix-mismatched-sources] resumo:", summary);
}

async function processRow(prisma: PrismaClient, row: CsvRow, summary: Summary) {
  summary.processed += 1;

  const wrongSource = await prisma.jobSource.findUnique({
    where: { id: row.jobSourceId },
  });
  if (!wrongSource) {
    // Ja aplicado numa execucao anterior (a fonte errada foi excluida) —
    // idempotente, so pula.
    summary.skippedAlreadyFixed += 1;
    console.log(
      `[fix-mismatched-sources] SKIP (ja corrigida) jobSourceId=${row.jobSourceId} (${row.companyName})`,
    );
    return;
  }
  if (wrongSource.companyId !== row.companyId) {
    // CSV desatualizado em relacao ao banco atual — nao adivinha, so avisa.
    summary.skippedStale += 1;
    console.warn(
      `[fix-mismatched-sources] SKIP (companyId no banco != CSV) jobSourceId=${row.jobSourceId}`,
    );
    return;
  }

  const canonicalUrl = canonicalizeSourceUrl(row.sourceUrl);
  const targetName = titleCase(row.matchedToken);
  const targetNormalized = normalizeCompanyName(targetName);
  if (!targetNormalized) {
    summary.errors += 1;
    console.error(
      `[fix-mismatched-sources] token invalido pra nome de empresa: "${row.matchedToken}" (jobSourceId=${row.jobSourceId})`,
    );
    return;
  }

  let targetCompany = await prisma.company.findUnique({
    where: { normalizedName: targetNormalized },
  });

  if (!targetCompany) {
    console.log(
      `[fix-mismatched-sources] CRIA Company "${targetName}" (dona real de ${canonicalUrl}, hoje em "${row.companyName}")`,
    );
    if (!DRY_RUN) {
      targetCompany = await prisma.company.create({
        data: {
          name: targetName,
          normalizedName: targetNormalized,
          isActive: true,
        },
      });
    }
    summary.companiesCreated += 1;
  } else if (!targetCompany.isActive) {
    console.log(
      `[fix-mismatched-sources] REATIVA Company "${targetCompany.name}" (${targetCompany.id})`,
    );
    if (!DRY_RUN) {
      targetCompany = await prisma.company.update({
        where: { id: targetCompany.id },
        data: { isActive: true },
      });
    }
    summary.companiesReactivated += 1;
  }

  // targetCompany.id so existe de verdade fora do dry-run (criacao acima e
  // pulada); usa o id real quando existe, ou um placeholder so pra log.
  const targetCompanyId = targetCompany?.id ?? "(dry-run: nova company)";

  let targetSource = targetCompany
    ? await prisma.jobSource.findFirst({
        where: { companyId: targetCompany.id, sourceUrl: canonicalUrl },
      })
    : null;

  if (!targetSource) {
    console.log(
      `[fix-mismatched-sources] CRIA JobSource "${targetName} careers" (${canonicalUrl}) em ${targetCompanyId}, ativa + agendamento ligado`,
    );
    if (!DRY_RUN && targetCompany) {
      targetSource = await prisma.jobSource.create({
        data: {
          companyId: targetCompany.id,
          sourceName: `${targetName} careers`,
          sourceType: wrongSource.sourceType,
          sourceUrl: canonicalUrl,
          parserKey: wrongSource.parserKey,
          crawlStrategy: wrongSource.crawlStrategy,
          checkIntervalMinutes: wrongSource.checkIntervalMinutes,
          isFallbackAdapter: wrongSource.isFallbackAdapter,
          scheduleCron: wrongSource.scheduleCron,
          scheduleTimezone: wrongSource.scheduleTimezone,
          isActive: true,
          scheduleEnabled: true,
        },
      });
    }
    summary.sourcesCreated += 1;
  } else {
    console.log(
      `[fix-mismatched-sources] REUSA JobSource existente ${targetSource.id} em ${targetCompanyId}, ativa + agendamento ligado`,
    );
    if (!DRY_RUN) {
      targetSource = await prisma.jobSource.update({
        where: { id: targetSource.id },
        data: { isActive: true, scheduleEnabled: true },
      });
    }
    summary.sourcesReused += 1;
  }

  const targetSourceId = targetSource?.id ?? "(dry-run: nova fonte)";

  const jobsToMove = await prisma.job.count({
    where: { jobSourceId: wrongSource.id },
  });
  if (jobsToMove > 0) {
    console.log(
      `[fix-mismatched-sources] MOVE ${jobsToMove} vaga(s) de "${row.companyName}"/${wrongSource.id} para ${targetCompanyId}/${targetSourceId}`,
    );
    if (!DRY_RUN && targetCompany && targetSource) {
      const result = await prisma.job.updateMany({
        where: { jobSourceId: wrongSource.id },
        data: { companyId: targetCompany.id, jobSourceId: targetSource.id },
      });
      summary.jobsMoved += result.count;
    } else {
      summary.jobsMoved += jobsToMove;
    }
  }

  console.log(
    `[fix-mismatched-sources] PAUSA + EXCLUI JobSource errada ${wrongSource.id} (${row.companyName})`,
  );
  if (!DRY_RUN) {
    await prisma.jobSource.update({
      where: { id: wrongSource.id },
      data: {
        isActive: false,
        scheduleEnabled: false,
        pauseReason: `saneamento-fontes: URL pertence a ${targetName}, nao a ${row.companyName} (fix-mismatched-sources.ts)`,
      },
    });
    await prisma.jobSource.delete({ where: { id: wrongSource.id } });
  }
  summary.wrongSourcesDeleted += 1;

  const remainingSources = await prisma.jobSource.count({
    where: {
      companyId: row.companyId,
      ...(DRY_RUN ? { NOT: { id: wrongSource.id } } : {}),
    },
  });
  // Em dry-run os jobs ainda nao foram movidos de verdade (nada foi
  // gravado), entao Job.count aqui ainda inclui os que SERIAM movidos —
  // subtrai jobsToMove pra simular o estado pos-apply corretamente.
  const remainingJobsRaw = await prisma.job.count({
    where: { companyId: row.companyId },
  });
  const remainingJobs = DRY_RUN
    ? Math.max(0, remainingJobsRaw - jobsToMove)
    : remainingJobsRaw;
  if (remainingSources === 0 && remainingJobs === 0) {
    console.log(
      `[fix-mismatched-sources] INATIVA Company errada "${row.companyName}" (${row.companyId}) — sem fonte/vaga restante`,
    );
    if (!DRY_RUN) {
      await prisma.company.update({
        where: { id: row.companyId },
        data: { isActive: false },
      });
    }
    summary.wrongCompaniesDeactivated += 1;
  } else {
    console.log(
      `[fix-mismatched-sources] MANTEM Company errada "${row.companyName}" ativa — ainda tem ${remainingSources} fonte(s)/${remainingJobs} vaga(s) legitima(s) de outra origem`,
    );
  }
}

main().catch((error: unknown) => {
  console.error("[fix-mismatched-sources] falhou:", error);
  process.exitCode = 1;
});
