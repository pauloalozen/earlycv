// Descoberta de fontes via beBee (bebee.com/br/jobs).
//
// O beBee agrega vagas de feeds pagos e a página de cada vaga expõe o link
// de candidatura original (apply_url). Quando esse link cai num ATS que já
// sabemos ler (Gupy, Pandapé, Sólides, InHire, Workday...), ele revela a
// empresa + o board dela. Este script:
//
//   1. Lê o sitemap BR de vagas do beBee e fica só com as vagas dos feeds
//      que trazem apply_url de ATS (TheirStack e Fantastic Jobs — ver
//      BEBEE_ATS_ORIGINS).
//   2. Baixa as páginas ainda não vistas (com pausa entre requisições) e
//      guarda o resultado num cache JSONL local, pra rodar em várias
//      sessões sem rebaixar nada (o sitemap tem ~35 mil vagas desses feeds).
//   3. Converte cada apply_url em board de ATS (matchAdapterUrl) e cruza com
//      o banco: fonte já cadastrada, candidato já na Descoberta, empresa já
//      existente (board novo pra revisar à mão) ou candidato novo.
//   4. Com --apply, cria os candidatos novos em DiscoveredCompany (PENDING,
//      careersUrl + adapterType já preenchidos, batchLabel "bebee-AAAA-MM-DD").
//      A validação e a promoção seguem pelo fluxo normal da aba Descoberta.
//
// Nunca copia conteúdo de vaga do beBee — só empresa e URL do board.
//
//   npm run discover:bebee-sources --workspace @earlycv/api                  # dry-run
//   npm run discover:bebee-sources --workspace @earlycv/api -- --apply
//   Opções: --limit=500 (páginas novas baixadas nesta execução; 0 = só
//   reprocessa o cache), --delay-ms=700, --origins=t7xk,fj,
//   --cache=caminho.jsonl, --report=caminho.csv

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { type JobSourceType, PrismaClient } from "@prisma/client";
import { IMPORTABLE_ADAPTER_TYPES } from "../ingestion/admin-ingestion-import.service";
import {
  BEBEE_ATS_ORIGINS,
  bebeeOriginOf,
  boardKey,
  isAggregatorHost,
  isGenericCompanyName,
  normalizeHost,
  parseBebeeJobPage,
} from "../ingestion/bebee-discovery";
import { normalizeCompanyName } from "../ingestion/name-normalization";
import { canonicalizeSourceUrl } from "../ingestion/url-normalization";
import { matchAdapterUrl } from "../ingestion/web-search/adapter-url-matcher";

const TAG = "[discover-sources-from-bebee]";
const APPLY = process.argv.includes("--apply");

function argValue(name: string) {
  return process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

const LIMIT = Number(argValue("limit") ?? 500);
const DELAY_MS = Number(argValue("delay-ms") ?? 700);
const ORIGINS = (
  argValue("origins") ?? Object.keys(BEBEE_ATS_ORIGINS).join(",")
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const CACHE_DIR = join(__dirname, "../../.cache/bebee-discovery");
const CACHE_PATH = argValue("cache") ?? join(CACHE_DIR, "pages.jsonl");
const TODAY = new Date().toISOString().slice(0, 10);
const REPORT_PATH =
  argValue("report") ?? join(CACHE_DIR, `report-${TODAY}.csv`);
const BATCH_LABEL = `bebee-${TODAY}`;

const SITEMAP_URL = "https://bebee.com/sitemaps/jobs/br";
const USER_AGENT = "EarlyCV-Discovery/1.0 (+https://earlycv.com.br)";

type CacheEntry = {
  applyUrl: string | null;
  error?: string;
  fetchedAt: string;
  publisherName: string | null;
  url: string;
};

type Board = {
  careersUrl: string;
  jobCount: number;
  key: string;
  names: Map<string, number>;
  sourceType: JobSourceType;
};

type Outcome =
  | "novo"
  | "ja_e_fonte"
  | "ja_na_descoberta"
  | "nome_ja_na_descoberta"
  | "empresa_existe_board_novo"
  | "nome_generico"
  | "adapter_nao_importavel";

const log = (message: string) => console.log(`${TAG} ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string, timeoutMs = 20_000) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xml" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

// O índice de sitemaps não lista o BR, mas /sitemaps/jobs/br existe; as
// páginas seguintes (/2, /3...) respondem 503 quando não existem. O XML tem
// ~9 MB e o servidor leva ~15 s pra comprimir — timeout próprio.
async function loadSitemapUrls() {
  const urls: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = page === 1 ? SITEMAP_URL : `${SITEMAP_URL}/${page}`;
    let xml: string;
    try {
      xml = await fetchText(url, 120_000);
    } catch (error) {
      if (page === 1) throw error;
      break;
    }
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1] as string,
    );
    if (locs.length === 0) break;
    urls.push(...locs);
    await sleep(DELAY_MS);
  }
  return urls;
}

function loadCache() {
  const cache = new Map<string, CacheEntry>();
  if (!existsSync(CACHE_PATH)) return cache;
  for (const line of readFileSync(CACHE_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as CacheEntry;
      cache.set(entry.url, entry);
    } catch {
      // linha truncada (execução interrompida no meio da escrita) — ignora
    }
  }
  return cache;
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function topName(names: Map<string, number>) {
  return [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

// apply_url → board de ATS. Workday precisa do site, que o matcher extrai.
function resolveBoard(applyUrl: string) {
  const matched = matchAdapterUrl(applyUrl);
  if (!matched) return null;
  return {
    careersUrl: canonicalizeSourceUrl(matched.careersUrl),
    sourceType: matched.sourceType as JobSourceType,
  };
}

async function main() {
  log(
    `modo ${APPLY ? "APLICANDO" : "DRY-RUN (nada será gravado)"} — origens ${ORIGINS.join(",")}, limite ${LIMIT} página(s) nova(s), pausa ${DELAY_MS} ms`,
  );
  mkdirSync(dirname(CACHE_PATH), { recursive: true });

  const cache = loadCache();
  log(`cache: ${cache.size} página(s) já baixadas (${CACHE_PATH})`);

  if (LIMIT > 0) {
    const sitemapUrls = await loadSitemapUrls();
    const candidates = sitemapUrls.filter((url) => {
      const origin = bebeeOriginOf(url);
      return origin !== null && ORIGINS.includes(origin);
    });
    const pending = candidates.filter((url) => !cache.has(url));
    log(
      `sitemap: ${sitemapUrls.length} vaga(s), ${candidates.length} das origens escolhidas, ${pending.length} ainda não baixadas`,
    );

    let fetched = 0;
    for (const url of pending.slice(0, LIMIT)) {
      let entry: CacheEntry;
      try {
        const links = parseBebeeJobPage(await fetchText(url));
        entry = { ...links, fetchedAt: new Date().toISOString(), url };
      } catch (error) {
        entry = {
          applyUrl: null,
          error: error instanceof Error ? error.message : "fetch failed",
          fetchedAt: new Date().toISOString(),
          publisherName: null,
          url,
        };
      }
      // Erro de rede não vai pro cache — a página entra de novo na próxima
      // execução. Página baixada sem apply_url vai (é resposta definitiva).
      if (!entry.error) {
        cache.set(url, entry);
        appendFileSync(CACHE_PATH, `${JSON.stringify(entry)}\n`);
      }
      fetched += 1;
      if (fetched % 100 === 0)
        log(`baixadas ${fetched}/${Math.min(LIMIT, pending.length)}`);
      await sleep(DELAY_MS);
    }
    log(`baixadas nesta execução: ${fetched}`);
  }

  // Agrega por board.
  const boards = new Map<string, Board>();
  const unsupportedHosts = new Map<
    string,
    { count: number; example: string; names: Map<string, number> }
  >();
  let withApplyUrl = 0;
  let onAggregator = 0;

  for (const entry of cache.values()) {
    if (!entry.applyUrl) continue;
    withApplyUrl += 1;
    const host = normalizeHost(entry.applyUrl);
    if (!host || isAggregatorHost(host)) {
      onAggregator += 1;
      continue;
    }

    const resolved = resolveBoard(entry.applyUrl);
    const key = resolved ? boardKey(resolved.careersUrl) : null;
    if (!resolved || !key) {
      const current = unsupportedHosts.get(host) ?? {
        count: 0,
        example: entry.applyUrl,
        names: new Map(),
      };
      current.count += 1;
      if (entry.publisherName)
        current.names.set(
          entry.publisherName,
          (current.names.get(entry.publisherName) ?? 0) + 1,
        );
      unsupportedHosts.set(host, current);
      continue;
    }

    const board = boards.get(key) ?? {
      careersUrl: resolved.careersUrl,
      jobCount: 0,
      key,
      names: new Map(),
      sourceType: resolved.sourceType,
    };
    board.jobCount += 1;
    if (entry.publisherName)
      board.names.set(
        entry.publisherName,
        (board.names.get(entry.publisherName) ?? 0) + 1,
      );
    boards.set(key, board);
  }

  log(
    `páginas no cache com apply_url: ${withApplyUrl} (${onAggregator} em agregador/LinkedIn/Indeed), boards de ATS conhecidos: ${boards.size}, hosts sem adapter: ${unsupportedHosts.size}`,
  );

  const prisma = new PrismaClient();
  const results: Array<{
    board: Board;
    name: string;
    outcome: Outcome;
    detail: string;
  }> = [];
  try {
    const [sources, discovered] = await Promise.all([
      prisma.jobSource.findMany({
        select: { company: { select: { name: true } }, sourceUrl: true },
      }),
      prisma.discoveredCompany.findMany({
        select: {
          careersUrl: true,
          name: true,
          normalizedName: true,
          status: true,
        },
      }),
    ]);
    const sourceByKey = new Map<string, string>();
    for (const source of sources) {
      const key = boardKey(source.sourceUrl);
      if (key) sourceByKey.set(key, source.company.name);
    }
    const discoveredByKey = new Map<string, string>();
    const discoveredByName = new Map<string, string>();
    for (const candidate of discovered) {
      discoveredByName.set(
        candidate.normalizedName,
        `${candidate.name} (${candidate.status})`,
      );
      const key = candidate.careersUrl ? boardKey(candidate.careersUrl) : null;
      if (key)
        discoveredByKey.set(key, `${candidate.name} (${candidate.status})`);
    }
    const importable = new Set<string>(IMPORTABLE_ADAPTER_TYPES);
    const createdNames = new Set<string>();

    for (const board of [...boards.values()].sort(
      (a, b) => b.jobCount - a.jobCount,
    )) {
      const name = topName(board.names) || board.key;
      const normalizedName = normalizeCompanyName(name);
      const push = (outcome: Outcome, detail = "") =>
        results.push({ board, detail, name, outcome });

      const existingSource = sourceByKey.get(board.key);
      if (existingSource) {
        push("ja_e_fonte", existingSource);
        continue;
      }
      const existingCandidate = discoveredByKey.get(board.key);
      if (existingCandidate) {
        push("ja_na_descoberta", existingCandidate);
        continue;
      }
      if (!importable.has(board.sourceType)) {
        push("adapter_nao_importavel", board.sourceType);
        continue;
      }
      if (!normalizedName || isGenericCompanyName(normalizedName)) {
        push("nome_generico");
        continue;
      }
      const sameNameCandidate = discoveredByName.get(normalizedName);
      if (sameNameCandidate || createdNames.has(normalizedName)) {
        push("nome_ja_na_descoberta", sameNameCandidate ?? "neste lote");
        continue;
      }
      const company = await prisma.company.findUnique({
        select: { name: true },
        where: { normalizedName },
      });
      if (company) {
        push("empresa_existe_board_novo", company.name);
        continue;
      }

      if (APPLY) {
        await prisma.discoveredCompany.create({
          data: {
            adapterType: board.sourceType,
            batchLabel: BATCH_LABEL,
            careersUrl: board.careersUrl,
            name,
            normalizedName,
            resolutionMethod: "bebee",
          },
        });
      }
      createdNames.add(normalizedName);
      push("novo");
    }
  } finally {
    await prisma.$disconnect();
  }

  const rows = [
    [
      "situacao",
      "empresa",
      "tipo_adapter",
      "careers_url",
      "vagas_vistas_no_bebee",
      "detalhe",
    ],
    ...results.map(({ board, detail, name, outcome }) => [
      outcome,
      name,
      board.sourceType,
      board.careersUrl,
      board.jobCount,
      detail,
    ]),
    ...[...unsupportedHosts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([host, info]) => [
        "ats_sem_adapter",
        topName(info.names),
        host,
        info.example,
        info.count,
        "",
      ]),
  ];
  writeFileSync(
    REPORT_PATH,
    `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
  );

  const summary: Record<string, number> = {};
  for (const { outcome } of results)
    summary[outcome] = (summary[outcome] ?? 0) + 1;
  summary.ats_sem_adapter = unsupportedHosts.size;
  const newByType: Record<string, number> = {};
  for (const { board, outcome } of results)
    if (outcome === "novo")
      newByType[board.sourceType] = (newByType[board.sourceType] ?? 0) + 1;

  console.log(`${TAG} resumo por board:`, summary);
  console.log(`${TAG} candidatos novos por adapter:`, newByType);
  log(`relatório: ${REPORT_PATH}`);
  if (APPLY)
    log(
      `${summary.novo ?? 0} candidato(s) criados em DiscoveredCompany (batchLabel ${BATCH_LABEL}). Valide pela aba Descoberta.`,
    );
  else log("nada foi gravado. Rode com --apply pra criar os candidatos novos.");
}

main().catch((error: unknown) => {
  console.error(`${TAG} falhou:`, error);
  process.exitCode = 1;
});
