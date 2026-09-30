import { readdirSync, readFileSync } from "node:fs";
import { getHeapStatistics } from "node:v8";
import { Logger } from "@nestjs/common";

import { getManagedProcessStats } from "./managed-process";

// Instrumentacao TEMPORARIA de memoria (investigacao de RAM da API na
// Railway). Desligada por padrao: so age com MEMORY_DIAGNOSTICS_ENABLED=true.
// Nunca loga conteudo de curriculo, e-mail, nome ou caminhos de arquivo —
// so contagens, PIDs, nomes de comando (comm) e bytes.
//
// Tres visoes separadas, de proposito:
//   1. heap JS / externa / ArrayBuffers (process.memoryUsage + v8)
//   2. cgroup do container (memory.current + memory.stat: anon vs file)
//   3. processos descendentes do Node e suspeitos orfaos (via /proc)
// cgroup - RSS(node) NAO e tratado como "memoria dos filhos": inclui page
// cache, slab e kernel. Os filhos sao medidos direto, por PID.

const logger = new Logger("MemoryDiagnostics");

const DEFAULT_SAMPLE_INTERVAL_MS = 60_000;
const DEFAULT_JOB_LOG_MIN_INTERVAL_MS = 30_000;
const SLOW_JOB_MS = 5_000;
const MAX_LISTED_PROCESSES = 10;
const CLOCK_TICKS_PER_SECOND = 100;
const SUSPECT_COMM = /soffice|oosplash|chrom|xvfb|pdftoppm|pdftotext/i;

const MB = 1024 * 1024;

export function isMemoryDiagnosticsEnabled(): boolean {
  return process.env.MEMORY_DIAGNOSTICS_ENABLED === "true";
}

function envMs(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : fallback;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function toMb(bytes: number): number {
  return round1(bytes / MB);
}

function safeLog(payload: Record<string, unknown>) {
  try {
    logger.log(JSON.stringify(payload));
  } catch {
    // instrumentacao nunca pode derrubar o fluxo
  }
}

// ---------------------------------------------------------------------------
// 1. Processo Node
// ---------------------------------------------------------------------------

export type NodeMemorySnapshot = {
  arrayBuffersMb: number;
  externalMb: number;
  heapTotalMb: number;
  heapUsedMb: number;
  rssMb: number;
};

export function takeNodeMemorySnapshot(): NodeMemorySnapshot {
  const usage = process.memoryUsage();
  return {
    arrayBuffersMb: toMb(usage.arrayBuffers),
    externalMb: toMb(usage.external),
    heapTotalMb: toMb(usage.heapTotal),
    heapUsedMb: toMb(usage.heapUsed),
    rssMb: toMb(usage.rss),
  };
}

function readV8Heap() {
  const heap = getHeapStatistics();
  return {
    heapSizeLimitMb: toMb(heap.heap_size_limit),
    mallocedMb: toMb(heap.malloced_memory),
    peakMallocedMb: toMb(heap.peak_malloced_memory),
    totalAvailableMb: toMb(heap.total_available_size),
  };
}

function deployInfo() {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA;
  return {
    commit: sha ? sha.slice(0, 8) : null,
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
    replicaId: process.env.RAILWAY_REPLICA_ID ?? null,
  };
}

// ---------------------------------------------------------------------------
// 2. cgroup
// ---------------------------------------------------------------------------

function readTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function parseKeyValueLines(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of text.split("\n")) {
    const [key, value] = line.trim().split(/\s+/);
    const parsed = Number(value);
    if (key && Number.isFinite(parsed)) out[key] = parsed;
  }
  return out;
}

const CGROUP_V2_STAT_KEYS = [
  "anon",
  "file",
  "kernel",
  "slab",
  "sock",
  "shmem",
  "file_mapped",
  "file_dirty",
  "active_anon",
  "inactive_anon",
  "active_file",
  "inactive_file",
] as const;

const CGROUP_V1_STAT_KEYS = [
  "total_rss",
  "total_cache",
  "total_mapped_file",
  "total_shmem",
  "total_active_file",
  "total_inactive_file",
] as const;

export function readCgroupMemory(root = "/sys/fs/cgroup") {
  const v2Current = readTextOrNull(`${root}/memory.current`);
  if (v2Current !== null) {
    const statText = readTextOrNull(`${root}/memory.stat`);
    const stat = statText ? parseKeyValueLines(statText) : {};
    const max = readTextOrNull(`${root}/memory.max`)?.trim();
    const currentBytes = Number(v2Current);
    const picked: Record<string, number> = {};
    for (const key of CGROUP_V2_STAT_KEYS) {
      if (key in stat) picked[`${key}Mb`] = toMb(stat[key]);
    }
    return {
      currentMb: toMb(currentBytes),
      maxMb: max && max !== "max" ? toMb(Number(max)) : null,
      stat: picked,
      version: 2 as const,
      // Aproximacao do "working set" (current - inactive_file), rotulada
      // como aproximacao: nao e necessariamente o que a Railway plota.
      workingSetApproxMb:
        "inactive_file" in stat
          ? toMb(currentBytes - stat.inactive_file)
          : null,
    };
  }

  const v1Usage = readTextOrNull(`${root}/memory/memory.usage_in_bytes`);
  if (v1Usage !== null) {
    const statText = readTextOrNull(`${root}/memory/memory.stat`);
    const stat = statText ? parseKeyValueLines(statText) : {};
    const picked: Record<string, number> = {};
    for (const key of CGROUP_V1_STAT_KEYS) {
      if (key in stat) picked[`${key}Mb`] = toMb(stat[key]);
    }
    return {
      currentMb: toMb(Number(v1Usage)),
      maxMb: null,
      stat: picked,
      version: 1 as const,
      workingSetApproxMb: null,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 3. Processos (via /proc; retorna null fora do Linux)
// ---------------------------------------------------------------------------

type ProcEntry = {
  comm: string;
  pgrp: number;
  pid: number;
  ppid: number;
  startTicks: number;
};

// /proc/<pid>/stat: "pid (comm) state ppid pgrp session ... starttime(22)".
// comm pode conter espacos/parenteses: parse a partir do ULTIMO ")".
export function parseProcStat(raw: string): ProcEntry | null {
  const open = raw.indexOf("(");
  const close = raw.lastIndexOf(")");
  if (open < 0 || close < open) return null;

  const pid = Number(raw.slice(0, open).trim());
  const rest = raw
    .slice(close + 1)
    .trim()
    .split(/\s+/);
  // rest[0]=state(3) rest[1]=ppid(4) rest[2]=pgrp(5) ... rest[19]=starttime(22)
  const ppid = Number(rest[1]);
  const pgrp = Number(rest[2]);
  const startTicks = Number(rest[19]);
  if (![pid, ppid, pgrp, startTicks].every(Number.isFinite)) return null;

  return { comm: raw.slice(open + 1, close), pgrp, pid, ppid, startTicks };
}

function readProcRss(pid: number, procRoot: string) {
  const status = readTextOrNull(`${procRoot}/${pid}/status`);
  if (!status) return null;
  const kb = (name: string) => {
    const match = status.match(new RegExp(`^${name}:\\s+(\\d+)\\s+kB`, "m"));
    return match ? Number(match[1]) : null;
  };
  const total = kb("VmRSS");
  if (total === null) return null;
  const anon = kb("RssAnon");
  const file = kb("RssFile");
  return {
    rssAnonMb: anon === null ? null : round1(anon / 1024),
    rssFileMb: file === null ? null : round1(file / 1024),
    rssMb: round1(total / 1024),
  };
}

function readAllProcEntries(procRoot: string): ProcEntry[] | null {
  let names: string[];
  try {
    names = readdirSync(procRoot);
  } catch {
    return null;
  }
  const entries: ProcEntry[] = [];
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    const raw = readTextOrNull(`${procRoot}/${name}/stat`);
    const parsed = raw ? parseProcStat(raw) : null;
    if (parsed) entries.push(parsed);
  }
  return entries;
}

function describeProcess(entry: ProcEntry, uptimeS: number, procRoot: string) {
  const rss = readProcRss(entry.pid, procRoot);
  return {
    ageS: Math.max(
      0,
      Math.round(uptimeS - entry.startTicks / CLOCK_TICKS_PER_SECOND),
    ),
    comm: entry.comm,
    pgrp: entry.pgrp,
    pid: entry.pid,
    ppid: entry.ppid,
    rssAnonMb: rss?.rssAnonMb ?? null,
    rssFileMb: rss?.rssFileMb ?? null,
    rssMb: rss?.rssMb ?? null,
  };
}

export function readProcessTree(
  selfPid: number = process.pid,
  procRoot = "/proc",
) {
  const entries = readAllProcEntries(procRoot);
  const uptimeText = readTextOrNull(`${procRoot}/uptime`);
  if (!entries || !uptimeText) return null;
  const systemUptimeS = Number(uptimeText.split(" ")[0]);

  const childrenOf = new Map<number, ProcEntry[]>();
  for (const entry of entries) {
    const list = childrenOf.get(entry.ppid) ?? [];
    list.push(entry);
    childrenOf.set(entry.ppid, list);
  }

  const descendantPids = new Set<number>();
  const queue = [...(childrenOf.get(selfPid) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || descendantPids.has(next.pid)) continue;
    descendantPids.add(next.pid);
    queue.push(...(childrenOf.get(next.pid) ?? []));
  }

  const descendants = entries
    .filter((entry) => descendantPids.has(entry.pid))
    .map((entry) => describeProcess(entry, systemUptimeS, procRoot));

  // Orfaos: soffice/chrome/Xvfb que perderam o pai (reparentados ao PID 1)
  // deixam de ser descendentes do Node — sem essa lista, o vazamento que
  // mais interessa ficaria invisivel na arvore.
  const orphanSuspects = entries
    .filter(
      (entry) =>
        entry.pid !== selfPid &&
        !descendantPids.has(entry.pid) &&
        SUSPECT_COMM.test(entry.comm),
    )
    .map((entry) => describeProcess(entry, systemUptimeS, procRoot));

  const byRss = (
    a: { rssMb: number | null },
    b: { rssMb: number | null },
  ): number => (b.rssMb ?? 0) - (a.rssMb ?? 0);
  const sumRss = (list: Array<{ rssMb: number | null }>) =>
    round1(list.reduce((total, item) => total + (item.rssMb ?? 0), 0));

  const byComm: Record<string, number> = {};
  for (const child of descendants) {
    byComm[child.comm] = (byComm[child.comm] ?? 0) + 1;
  }

  return {
    children: {
      byComm,
      count: descendants.length,
      oldestAgeS: descendants.reduce((max, c) => Math.max(max, c.ageS), 0),
      // Soma de RSS: paginas compartilhadas (libs) sao contadas em cada
      // processo — e um teto, nao a memoria exclusiva.
      rssSumMb: sumRss(descendants),
      top: [...descendants].sort(byRss).slice(0, MAX_LISTED_PROCESSES),
    },
    orphanSuspects: {
      count: orphanSuspects.length,
      rssSumMb: sumRss(orphanSuspects),
      top: [...orphanSuspects].sort(byRss).slice(0, MAX_LISTED_PROCESSES),
    },
  };
}

// ---------------------------------------------------------------------------
// Contadores de jobs (workers/crons)
// ---------------------------------------------------------------------------

type JobStats = {
  active: number;
  failures: number;
  lastLogAt: number;
  maxDurationMs: number;
  runs: number;
  runsWithWork: number;
  suppressedLogs: number;
  totalDurationMs: number;
  totalItems: number;
};

const jobStats = new Map<string, JobStats>();
const activeRuns = new Map<number, { name: string; startedAt: number }>();
let nextRunId = 1;

function statsFor(name: string): JobStats {
  let stats = jobStats.get(name);
  if (!stats) {
    stats = {
      active: 0,
      failures: 0,
      lastLogAt: 0,
      maxDurationMs: 0,
      runs: 0,
      runsWithWork: 0,
      suppressedLogs: 0,
      totalDurationMs: 0,
      totalItems: 0,
    };
    jobStats.set(name, stats);
  }
  return stats;
}

// Envolve UMA execucao de worker/cron. Retorno numerico = tamanho do lote.
// Nao altera resultado nem excecao de `fn`. Com a flag desligada e so `fn()`.
//
// Log por execucao SO quando houve trabalho (lote > 0), falha ou lentidao,
// e no maximo 1 linha por job a cada JOB_LOG_MIN_INTERVAL_MS — ticks ociosos
// de 1s/5s/15s so incrementam contadores (visiveis no sample periodico).
export async function trackJob<T>(name: string, fn: () => Promise<T>) {
  if (!isMemoryDiagnosticsEnabled()) return fn();

  const stats = statsFor(name);
  const runId = nextRunId++;
  const startedAt = Date.now();
  let before: NodeMemorySnapshot | null = null;
  let concurrentJobs = 1;
  try {
    before = takeNodeMemorySnapshot();
    activeRuns.set(runId, { name, startedAt });
    concurrentJobs = activeRuns.size;
    stats.runs += 1;
    stats.active += 1;
  } catch {
    // ignora
  }

  let ok = true;
  let batchSize: number | null = null;
  try {
    const result = await fn();
    if (typeof result === "number") batchSize = result;
    return result;
  } catch (error) {
    ok = false;
    throw error;
  } finally {
    try {
      const durationMs = Date.now() - startedAt;
      activeRuns.delete(runId);
      stats.active -= 1;
      stats.totalDurationMs += durationMs;
      stats.maxDurationMs = Math.max(stats.maxDurationMs, durationMs);
      if (!ok) stats.failures += 1;
      if (batchSize !== null && batchSize > 0) {
        stats.runsWithWork += 1;
        stats.totalItems += batchSize;
      }

      const interesting =
        !ok || (batchSize ?? 0) > 0 || durationMs >= SLOW_JOB_MS;
      if (interesting) {
        const now = Date.now();
        const minInterval = envMs(
          "MEMORY_DIAGNOSTICS_JOB_LOG_MIN_INTERVAL_MS",
          DEFAULT_JOB_LOG_MIN_INTERVAL_MS,
        );
        if (!ok || now - stats.lastLogAt >= minInterval) {
          const after = takeNodeMemorySnapshot();
          safeLog({
            after,
            batchSize,
            before,
            concurrentJobsAtStart: concurrentJobs,
            durationMs,
            event: "mem_job",
            job: name,
            ok,
            suppressedSinceLastLog: stats.suppressedLogs,
          });
          stats.lastLogAt = now;
          stats.suppressedLogs = 0;
        } else {
          stats.suppressedLogs += 1;
        }
      }
    } catch {
      // ignora
    }
  }
}

// ---------------------------------------------------------------------------
// Contadores de conversoes (LibreOffice / Puppeteer)
// ---------------------------------------------------------------------------

type ConversionStats = {
  active: number;
  completed: number;
  failed: number;
  started: number;
  timedOut: number;
};

const conversionStats = new Map<string, ConversionStats>();

function isTimeoutError(error: unknown): boolean {
  const err = error as { code?: unknown; name?: unknown } | null;
  return err?.code === "ETIMEDOUT" || err?.name === "CvExtractionTimeoutError";
}

export async function trackConversion<T>(kind: string, fn: () => Promise<T>) {
  if (!isMemoryDiagnosticsEnabled()) return fn();

  let stats = conversionStats.get(kind);
  if (!stats) {
    stats = { active: 0, completed: 0, failed: 0, started: 0, timedOut: 0 };
    conversionStats.set(kind, stats);
  }
  stats.started += 1;
  stats.active += 1;
  try {
    const result = await fn();
    stats.completed += 1;
    return result;
  } catch (error) {
    stats.failed += 1;
    if (isTimeoutError(error)) stats.timedOut += 1;
    throw error;
  } finally {
    stats.active -= 1;
  }
}

// ---------------------------------------------------------------------------
// Amostragem periodica
// ---------------------------------------------------------------------------

export type SampleReaders = {
  cgroup: () => unknown;
  processes: () => unknown;
  v8: () => unknown;
};

const defaultReaders: SampleReaders = {
  cgroup: () => readCgroupMemory(),
  processes: () => readProcessTree(),
  v8: () => readV8Heap(),
};

// Cada fonte de metrica e isolada: falha em /proc, cgroup ou v8 omite so
// aquela secao (null) e nunca impede as demais nem propaga excecao.
function section(read: () => unknown): unknown {
  try {
    return read();
  } catch {
    return null;
  }
}

export function buildSample(readers: SampleReaders = defaultReaders) {
  const now = Date.now();
  return {
    activeJobs: [...activeRuns.values()].map((run) => ({
      job: run.name,
      runningForS: Math.round((now - run.startedAt) / 1000),
    })),
    cgroup: section(readers.cgroup),
    conversions: Object.fromEntries(conversionStats),
    event: "mem_sample",
    jobs: Object.fromEntries(
      [...jobStats.entries()].map(([name, s]) => [
        name,
        {
          active: s.active,
          avgDurationMs:
            s.runs > 0 ? Math.round(s.totalDurationMs / s.runs) : 0,
          failures: s.failures,
          maxDurationMs: s.maxDurationMs,
          runs: s.runs,
          runsWithWork: s.runsWithWork,
          totalItems: s.totalItems,
        },
      ]),
    ),
    managedProcesses: getManagedProcessStats(),
    node: section(takeNodeMemorySnapshot),
    pid: process.pid,
    processes: section(readers.processes),
    uptimeS: Math.round(process.uptime()),
    v8: section(readers.v8),
  };
}

let samplerStarted = false;
let samplerTimer: NodeJS.Timeout | null = null;
let sampling = false;

// A coleta e sincrona (readFileSync em /proc e cgroup), entao dois ticks
// nunca se sobrepoem e nada fica enfileirado; o guard `sampling` torna essa
// garantia explicita caso a coleta um dia vire assincrona. setInterval so
// agenda o proximo tick depois do atual, sem acumular execucoes pendentes.
export function runSampleTick(readers: SampleReaders = defaultReaders) {
  if (sampling) return;
  sampling = true;
  try {
    safeLog({
      ...buildSample(readers),
      deploymentId: deployInfo().deploymentId,
    });
  } catch {
    // instrumentacao nunca derruba a API
  } finally {
    sampling = false;
  }
}

export function startMemoryDiagnostics() {
  if (!isMemoryDiagnosticsEnabled() || samplerStarted) return;
  samplerStarted = true;

  try {
    safeLog({
      deploy: deployInfo(),
      event: "mem_boot",
      nodeVersion: process.version,
      pid: process.pid,
      // Confirma em producao quem e o PID 1 (esperado: tini) e o pai do Node.
      pid1Comm: readTextOrNull("/proc/1/comm")?.trim() ?? null,
      ppid: process.ppid,
      sampleIntervalMs: envMs(
        "MEMORY_DIAGNOSTICS_INTERVAL_MS",
        DEFAULT_SAMPLE_INTERVAL_MS,
      ),
      v8: section(readV8Heap),
    });

    samplerTimer = setInterval(
      () => runSampleTick(),
      envMs("MEMORY_DIAGNOSTICS_INTERVAL_MS", DEFAULT_SAMPLE_INTERVAL_MS),
    );
    samplerTimer.unref();
  } catch {
    // instrumentacao nunca derruba a API
  }
}

// So para testes: permite reiniciar o sampler no mesmo processo.
export function stopMemoryDiagnosticsForTest() {
  if (samplerTimer) clearInterval(samplerTimer);
  samplerTimer = null;
  samplerStarted = false;
  sampling = false;
}
