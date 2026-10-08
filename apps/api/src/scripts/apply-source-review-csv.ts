// Aplica a revisao manual de fontes feita na planilha exportada da lista
// "empresas/fontes ordenadas por vagas" (out/2026). Colunas usadas:
//
//   Situacao       — o que fazer (ver ACOES abaixo; vazio/"ok" = nada)
//   Empresa certa  — nome da empresa dona de verdade, ou a URL certa
//                    (acao "Fonte para ...")
//   empresa, url_fonte, adapter, company_id, job_source_id — estado atual
//
// ACOES (Situacao, sem diferenciar maiuscula/espaco):
//
//   "empresa errada" — a fonte (e as vagas dela) pertence a "Empresa
//     certa". Acha a Company por normalizedName exato (ou cria, ativa); se
//     ela ja tem uma fonte do mesmo tipo pro mesmo board, move as vagas pra
//     essa e exclui a fonte errada; senao MOVE a propria JobSource pra
//     empresa certa (mantem historico de runs). A empresa errada so e
//     inativada se ficar sem nenhuma fonte e nenhuma vaga.
//   "renomear empresa" — renomeia a Company. Se o nome novo ja pertence a
//     outra Company, vira "empresa errada" (junta na existente).
//   "apagar empresa, duplicada" / "excluir fonte e empresa" — DELETE da
//     Company (cascata em fontes, vagas, recomendacoes e historico de
//     alertas dessas vagas). Recusa se alguma vaga tiver SavedJob ou
//     JobApplication de usuario (dado do usuario) — nesse caso so avisa.
//   "fonte errada, ... sapsf" — marca as vagas da fonte como removed, exclui
//     a fonte e cria uma fonte successfactors pausada (sem adapter) se a URL
//     vier em "Empresa certa" ou em --url-<job_source_id>=...
//   "excluir fonte" — mesmo que acima, sem criar fonte nova.
//   "excluir empresa" — mesmo que "apagar empresa".
//   "fonte para <empresa>" — cria na company_id da linha uma fonte nova com a
//     URL de "Empresa certa"; tipo inferido do host (lgcloud/successfactors
//     ficam pausadas, sem adapter).
//   "criar empresa e fonte" — garante a Company "empresa" e uma fonte pra
//     url_fonte (tipo inferido do host); nao mexe na fonte da linha.
//
// Linhas com Situacao nao reconhecida sao listadas no fim, sem mexer.
// Idempotente: linha cuja fonte ja nao existe/ja mudou de dono e pulada.
//
//   npm run apply:source-review-csv --workspace @earlycv/api            # dry-run
//   npm run apply:source-review-csv --workspace @earlycv/api -- --apply
//   (--csv=/outro.csv pra usar outra planilha)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type JobSource,
  type JobSourceType,
  PrismaClient,
} from "@prisma/client";
import { isSameBoard } from "../ingestion/company-source-audit-heuristics";
import { normalizeCompanyName } from "../ingestion/name-normalization";
import { canonicalizeSourceUrl } from "../ingestion/url-normalization";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const TAG = "[apply-source-review-csv]";
// Revisao feita no homolog em 2026-10-08 (+ 2 linhas no fim juntando a
// duplicata "Rumo Logistica" em "RUMO S/A", feita a mao no homolog).
const DEFAULT_CSV_PATH = join(__dirname, "data/2026-10-08-source-review.csv");

type Row = {
  line: number;
  situacao: string;
  empresaCerta: string;
  empresa: string;
  url: string;
  companyId: string;
  jobSourceId: string;
};

// Parser CSV minimo (RFC4180), mesmo de fix-mismatched-sources.ts.
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

function loadRows(csvPath: string): Row[] {
  const [header, ...lines] = parseCsv(readFileSync(csvPath, "utf8"));
  if (!header) return [];
  const col = (name: string) => {
    const index = header.findIndex(
      (h) => h.trim().toLowerCase() === name.toLowerCase(),
    );
    if (index === -1) throw new Error(`coluna "${name}" nao encontrada no CSV`);
    return index;
  };
  const idx = {
    situacao: col("Situacao"),
    empresaCerta: col("Empresa certa"),
    empresa: col("empresa"),
    url: col("url_fonte"),
    companyId: col("company_id"),
    jobSourceId: col("job_source_id"),
  };
  return lines.map((cols, i) => ({
    line: i + 2,
    situacao: (cols[idx.situacao] ?? "").trim(),
    empresaCerta: (cols[idx.empresaCerta] ?? "").trim(),
    empresa: (cols[idx.empresa] ?? "").trim(),
    url: (cols[idx.url] ?? "").trim(),
    companyId: (cols[idx.companyId] ?? "").trim(),
    jobSourceId: (cols[idx.jobSourceId] ?? "").trim(),
  }));
}

type SourceTypeGuess = {
  sourceType: JobSourceType;
  crawlStrategy: "api" | "html";
  implemented: boolean;
};

function guessSourceType(url: string): SourceTypeGuess | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const api = (sourceType: JobSourceType, implemented = true) => ({
    sourceType,
    crawlStrategy: "api" as const,
    implemented,
  });
  if (host.endsWith("lgcloud.com.br")) return api("lgcloud", false);
  if (host.includes("successfactors")) return api("successfactors", false);
  if (host.endsWith("gupy.io")) return api("gupy");
  if (host.endsWith("inhire.app")) return api("inhire");
  if (host.includes("pandape")) return api("pandape");
  if (host.endsWith("teamtailor.com")) return api("teamtailor");
  if (host.includes("greenhouse.io")) return api("greenhouse");
  if (host.endsWith("lever.co")) return api("lever");
  if (host.endsWith("ashbyhq.com")) return api("ashby");
  if (host.includes("myworkdayjobs.com")) return api("workday");
  return null;
}

const summary = {
  linhas: 0,
  ok: 0,
  fontesMovidas: 0,
  fontesMescladas: 0,
  fontesExcluidas: 0,
  fontesCriadas: 0,
  empresasCriadas: 0,
  empresasRenomeadas: 0,
  empresasExcluidas: 0,
  empresasInativadas: 0,
  vagasMovidas: 0,
  vagasRemovidas: 0,
  puladas: 0,
  erros: 0,
};
const pendencias: string[] = [];

function log(message: string) {
  console.log(`${TAG} ${message}`);
}

function pend(row: Row, message: string) {
  pendencias.push(`linha ${row.line} (${row.empresa}): ${message}`);
  summary.puladas += 1;
}

async function loadSourceOfRow(prisma: PrismaClient, row: Row) {
  const source = await prisma.jobSource.findUnique({
    where: { id: row.jobSourceId },
  });
  if (!source) {
    log(
      `SKIP linha ${row.line}: fonte ${row.jobSourceId} nao existe (ja aplicada?)`,
    );
    summary.puladas += 1;
    return null;
  }
  if (source.companyId !== row.companyId) {
    log(
      `SKIP linha ${row.line}: fonte ${row.jobSourceId} ja nao e de ${row.companyId} (ja aplicada?)`,
    );
    summary.puladas += 1;
    return null;
  }
  return source;
}

async function similarCompanies(prisma: PrismaClient, normalized: string) {
  const first = normalized.split("-")[0];
  if (!first || first.length < 3) return "";
  const rows = await prisma.company.findMany({
    where: { normalizedName: { startsWith: first } },
    select: { name: true },
    take: 5,
  });
  return rows.length
    ? ` (parecidas ja existentes: ${rows.map((r) => r.name).join(" | ")})`
    : "";
}

async function findOrCreateCompany(prisma: PrismaClient, name: string) {
  const normalizedName = normalizeCompanyName(name);
  if (!normalizedName) throw new Error(`nome de empresa invalido: "${name}"`);
  const existing = await prisma.company.findUnique({
    where: { normalizedName },
  });
  if (existing) {
    if (!existing.isActive) {
      log(`  REATIVA Company "${existing.name}" (${existing.id})`);
      if (!DRY_RUN) {
        await prisma.company.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
      }
    }
    log(`  destino: Company existente "${existing.name}" (${existing.id})`);
    return existing;
  }
  log(
    `  CRIA Company "${name}"${await similarCompanies(prisma, normalizedName)}`,
  );
  summary.empresasCriadas += 1;
  if (DRY_RUN) return null;
  return prisma.company.create({
    data: { name, normalizedName, isActive: true },
  });
}

async function deactivateIfEmpty(
  prisma: PrismaClient,
  companyId: string,
  ignoredSourceId: string,
  jobsLeaving: number,
) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return;
  const sources = await prisma.jobSource.count({
    where: { companyId, ...(DRY_RUN ? { NOT: { id: ignoredSourceId } } : {}) },
  });
  const jobsRaw = await prisma.job.count({ where: { companyId } });
  const jobs = DRY_RUN ? Math.max(0, jobsRaw - jobsLeaving) : jobsRaw;
  if (sources === 0 && jobs === 0 && company.isActive) {
    log(`  INATIVA Company errada "${company.name}" (sem fonte/vaga restante)`);
    summary.empresasInativadas += 1;
    if (!DRY_RUN) {
      await prisma.company.update({
        where: { id: companyId },
        data: { isActive: false },
      });
    }
  } else {
    log(
      `  MANTEM Company "${company.name}" (${sources} fonte(s), ${jobs} vaga(s) restantes)`,
    );
  }
}

// Fonte certa pertence a outra empresa: junta numa fonte equivalente que o
// destino ja tenha (mesmo tipo + mesmo board) ou move a propria JobSource.
async function moveSourceTo(
  prisma: PrismaClient,
  row: Row,
  source: JobSource,
  targetName: string,
) {
  const target = await findOrCreateCompany(prisma, targetName);
  if (target && target.id === source.companyId) {
    log("  fonte ja esta na empresa certa — nada a mover");
    return;
  }
  const jobCount = await prisma.job.count({
    where: { jobSourceId: source.id },
  });
  const equivalent = target
    ? (
        await prisma.jobSource.findMany({
          where: { companyId: target.id, sourceType: source.sourceType },
        })
      ).find((s) => isSameBoard(s.sourceUrl, source.sourceUrl))
    : undefined;

  if (equivalent && target) {
    log(
      `  MESCLA: ${jobCount} vaga(s) -> fonte existente ${equivalent.id} (${equivalent.sourceUrl}); EXCLUI fonte ${source.id}`,
    );
    if (!DRY_RUN) {
      await prisma.$transaction([
        prisma.job.updateMany({
          where: { jobSourceId: source.id },
          data: { companyId: target.id, jobSourceId: equivalent.id },
        }),
        prisma.jobSource.delete({ where: { id: source.id } }),
      ]);
    }
    summary.fontesMescladas += 1;
  } else {
    log(`  MOVE fonte ${source.id} + ${jobCount} vaga(s) -> "${targetName}"`);
    if (!DRY_RUN && target) {
      const clash = await prisma.jobSource.findUnique({
        where: {
          companyId_sourceUrl: {
            companyId: target.id,
            sourceUrl: source.sourceUrl,
          },
        },
      });
      if (clash)
        throw new Error(
          `destino ja tem fonte ${clash.id} com a mesma URL e outro tipo`,
        );
      await prisma.$transaction([
        prisma.jobSource.update({
          where: { id: source.id },
          data: { companyId: target.id, sourceName: `${target.name} careers` },
        }),
        prisma.job.updateMany({
          where: { jobSourceId: source.id },
          data: { companyId: target.id },
        }),
      ]);
    }
    summary.fontesMovidas += 1;
  }
  summary.vagasMovidas += jobCount;
  await deactivateIfEmpty(prisma, row.companyId, source.id, jobCount);
}

async function createSource(
  prisma: PrismaClient,
  companyId: string | null,
  companyName: string,
  rawUrl: string,
) {
  const guess = guessSourceType(rawUrl);
  if (!guess) throw new Error(`nao sei inferir o tipo de fonte de ${rawUrl}`);
  const sourceUrl = canonicalizeSourceUrl(rawUrl);
  if (companyId) {
    const existing = (
      await prisma.jobSource.findMany({
        where: { companyId, sourceType: guess.sourceType },
      })
    ).find((s) => isSameBoard(s.sourceUrl, sourceUrl));
    if (existing) {
      log(
        `  fonte ja existe: ${existing.id} (${existing.sourceUrl}) — nada a criar`,
      );
      return;
    }
  }
  log(
    `  CRIA fonte ${guess.sourceType} ${sourceUrl} em "${companyName}"${guess.implemented ? "" : " — PAUSADA (adapter nao implementado)"}`,
  );
  summary.fontesCriadas += 1;
  if (DRY_RUN || !companyId) return;
  await prisma.jobSource.create({
    data: {
      companyId,
      sourceName: `${companyName} careers`,
      sourceType: guess.sourceType,
      parserKey: guess.sourceType,
      sourceUrl,
      crawlStrategy: guess.crawlStrategy,
      checkIntervalMinutes: 1440,
      isActive: guess.implemented,
      pauseReason: guess.implemented ? null : "adapter nao implementado",
    },
  });
}

async function deleteCompany(prisma: PrismaClient, row: Row) {
  const company = await prisma.company.findUnique({
    where: { id: row.companyId },
  });
  if (!company) {
    log(`SKIP linha ${row.line}: company ${row.companyId} ja nao existe`);
    summary.puladas += 1;
    return;
  }
  const jobWhere = { job: { companyId: company.id } };
  const [jobs, saved, applications, recommendations, alerts] =
    await Promise.all([
      prisma.job.count({ where: { companyId: company.id } }),
      prisma.savedJob.count({ where: jobWhere }),
      prisma.jobApplication.count({ where: jobWhere }),
      prisma.userJobRecommendation.count({ where: jobWhere }),
      prisma.monitorMatchJob.count({ where: jobWhere }),
    ]);
  if (saved > 0 || applications > 0) {
    pend(
      row,
      `NAO apaguei "${company.name}": ${saved} vaga(s) salva(s) e ${applications} candidatura(s) de usuario apontam pras vagas dela`,
    );
    return;
  }
  log(
    `  APAGA Company "${company.name}" + fontes + ${jobs} vaga(s) (cascata: ${recommendations} recomendacao(oes), ${alerts} item(ns) de historico do alerta)`,
  );
  summary.empresasExcluidas += 1;
  summary.vagasRemovidas += jobs;
  if (!DRY_RUN) await prisma.company.delete({ where: { id: company.id } });
}

async function processRow(prisma: PrismaClient, row: Row) {
  const action = row.situacao.toLowerCase().replace(/\s+/g, " ");
  if (action === "" || action === "ok") {
    summary.ok += 1;
    return;
  }
  log(`linha ${row.line} [${row.situacao}] "${row.empresa}" ${row.url}`);

  if (action === "empresa errada") {
    if (!row.empresaCerta) return pend(row, '"Empresa certa" vazia');
    const source = await loadSourceOfRow(prisma, row);
    if (source) await moveSourceTo(prisma, row, source, row.empresaCerta);
    return;
  }

  if (action === "renomear empresa") {
    if (!row.empresaCerta) return pend(row, '"Empresa certa" vazia');
    const normalizedName = normalizeCompanyName(row.empresaCerta);
    const owner = await prisma.company.findUnique({
      where: { normalizedName },
    });
    if (owner && owner.id !== row.companyId) {
      log(
        `  nome "${row.empresaCerta}" ja e de outra Company (${owner.id}) — juntando nela`,
      );
      const source = await loadSourceOfRow(prisma, row);
      if (source) await moveSourceTo(prisma, row, source, row.empresaCerta);
      return;
    }
    if (owner && owner.name === row.empresaCerta) {
      log(`SKIP linha ${row.line}: ja renomeada`);
      summary.puladas += 1;
      return;
    }
    log(`  RENOMEIA Company ${row.companyId} -> "${row.empresaCerta}"`);
    summary.empresasRenomeadas += 1;
    if (!DRY_RUN) {
      await prisma.company.update({
        where: { id: row.companyId },
        data: { name: row.empresaCerta, normalizedName },
      });
    }
    return;
  }

  if (
    action.startsWith("apagar empresa") ||
    action === "excluir fonte e empresa" ||
    action === "excluir empresa"
  ) {
    await deleteCompany(prisma, row);
    return;
  }

  if (action.startsWith("fonte errada") || action === "excluir fonte") {
    const source = await loadSourceOfRow(prisma, row);
    if (!source) return;
    const jobs = await prisma.job.count({
      where: { jobSourceId: source.id, status: { not: "removed" } },
    });
    log(`  MARCA ${jobs} vaga(s) como removed e EXCLUI fonte ${source.id}`);
    if (!DRY_RUN) {
      await prisma.$transaction([
        prisma.job.updateMany({
          where: { jobSourceId: source.id, status: { not: "removed" } },
          data: { status: "removed" },
        }),
        prisma.jobSource.delete({ where: { id: source.id } }),
      ]);
    }
    summary.vagasRemovidas += jobs;
    summary.fontesExcluidas += 1;
    const urlArg = process.argv
      .find((a) => a.startsWith(`--url-${row.jobSourceId}=`))
      ?.split("=")
      .slice(1)
      .join("=");
    const correctUrl =
      urlArg ?? (row.empresaCerta.startsWith("http") ? row.empresaCerta : "");
    if (correctUrl) {
      await createSource(prisma, row.companyId, row.empresa, correctUrl);
    } else if (action.startsWith("fonte errada")) {
      pend(
        row,
        "fonte errada excluida, mas falta a URL certa (SuccessFactors) pra criar a nova",
      );
    }
    return;
  }

  if (action.startsWith("fonte para")) {
    if (!row.empresaCerta.startsWith("http"))
      return pend(row, 'URL em "Empresa certa" ausente');
    const company = await prisma.company.findUnique({
      where: { id: row.companyId },
    });
    if (!company) return pend(row, `company ${row.companyId} nao existe`);
    // Linha anterior ("empresa errada") pode ter acabado de inativar essa
    // empresa por ficar sem fonte — ela continua sendo real.
    if (!company.isActive) {
      log(`  REATIVA Company "${company.name}"`);
      if (!DRY_RUN) {
        await prisma.company.update({
          where: { id: company.id },
          data: { isActive: true },
        });
      }
    }
    await createSource(prisma, company.id, company.name, row.empresaCerta);
    return;
  }

  if (action === "criar empresa e fonte") {
    // Board ja coletado por outra empresa (ex: duplicada juntada depois da
    // revisao) — criar de novo so reintroduziria a duplicata.
    const guess = guessSourceType(row.url);
    const owner = guess
      ? (
          await prisma.jobSource.findMany({
            where: { sourceType: guess.sourceType },
            include: { company: { select: { name: true } } },
          })
        ).find(
          (s) =>
            normalizeCompanyName(s.company.name) !==
              normalizeCompanyName(row.empresa) &&
            isSameBoard(s.sourceUrl, row.url),
        )
      : undefined;
    if (owner) {
      log(
        `SKIP linha ${row.line}: board ja e coletado por "${owner.company.name}" (${owner.sourceUrl})`,
      );
      summary.puladas += 1;
      return;
    }
    const company = await findOrCreateCompany(prisma, row.empresa);
    await createSource(prisma, company?.id ?? null, row.empresa, row.url);
    return;
  }

  pend(row, `Situacao nao reconhecida: "${row.situacao}"`);
}

async function main() {
  const csvPath =
    process.argv.find((a) => a.startsWith("--csv="))?.slice(6) ??
    DEFAULT_CSV_PATH;
  const rows = loadRows(csvPath);
  log(
    `${rows.length} linha(s) — modo ${DRY_RUN ? "DRY-RUN (nada sera gravado)" : "APLICANDO"}`,
  );

  const prisma = new PrismaClient();
  try {
    for (const row of rows) {
      summary.linhas += 1;
      try {
        await processRow(prisma, row);
      } catch (error) {
        summary.erros += 1;
        console.error(`${TAG} ERRO linha ${row.line} (${row.empresa}):`, error);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`${TAG} resumo:`, summary);
  if (pendencias.length) {
    console.log(`${TAG} pendencias (nada feito nessas linhas):`);
    for (const p of pendencias) console.log(`  - ${p}`);
  }
  if (DRY_RUN) log("nada foi gravado. Rode com --apply pra aplicar.");
}

main().catch((error: unknown) => {
  console.error(`${TAG} falhou:`, error);
  process.exitCode = 1;
});
