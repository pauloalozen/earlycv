import { Logger } from "@nestjs/common";

// Devolve ao SO, de hora em hora, a memoria que o glibc ja liberou mas
// segura nas arenas por fragmentacao. Causa medida (out/2026): o engine do
// Prisma (Rust) aloca GBs em consultas pesadas, libera tudo ao terminar, e
// o RSS fica preso no pico — nem MALLOC_ARENA_MAX, nem MALLOC_TRIM_THRESHOLD_,
// nem jemalloc via LD_PRELOAD resolvem (o Prisma carrega o engine com
// RTLD_DEEPBIND, que o amarra ao malloc do glibc). malloc_trim(0) derrubou
// 2,7 GB -> 134 MB no benchmark local.
//
// So devolve paginas JA livres: nao mexe em memoria em uso, nao mata
// processo, nao aloca. O custo e travar o event loop enquanto varre as
// arenas (~200-300 ms com 3 GB presos), por isso roda so de hora em hora e
// so acima de um RSS minimo. Desliga com MALLOC_TRIM_ENABLED=false.

const logger = new Logger("MallocTrim");

const DEFAULT_INTERVAL_MS = 60 * 60_000;
const DEFAULT_MIN_RSS_MB = 300;
const MB = 1024 * 1024;

export type MallocTrimFn = (pad: number) => number;

type TrimDeps = {
  minRssMb: number;
  now: () => number;
  readRss: () => number;
  trim: MallocTrimFn;
};

let trimTimer: NodeJS.Timeout | null = null;
let trimStarted = false;

export function isMallocTrimEnabled(): boolean {
  return (
    process.env.MALLOC_TRIM_ENABLED !== "false" && process.platform === "linux"
  );
}

function envNumber(name: string, fallback: number, min: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function safeLog(payload: Record<string, unknown>) {
  try {
    logger.log(JSON.stringify(payload));
  } catch {
    // log nunca pode derrubar o fluxo
  }
}

export async function loadMallocTrim(): Promise<MallocTrimFn | null> {
  try {
    const mod = await import("koffi");
    // koffi e CJS: via import() o modulo pode vir em `default`.
    const koffi = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const trim = koffi
      .load("libc.so.6")
      .func("int malloc_trim(size_t pad)") as MallocTrimFn;
    return trim;
  } catch (error) {
    // Ex.: libc nao-glibc (musl/Alpine) ou binario do koffi indisponivel.
    logger.warn(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        event: "mem_trim_unavailable",
      }),
    );
    return null;
  }
}

export function runMallocTrimTick(deps: TrimDeps) {
  try {
    const rssBeforeMb = round1(deps.readRss() / MB);
    if (rssBeforeMb < deps.minRssMb) {
      safeLog({
        event: "mem_trim",
        minRssMb: deps.minRssMb,
        rssBeforeMb,
        skipped: "below_min_rss",
      });
      return;
    }

    const startedAt = deps.now();
    const released = deps.trim(0);
    const durationMs = round1(deps.now() - startedAt);
    const rssAfterMb = round1(deps.readRss() / MB);

    safeLog({
      durationMs,
      event: "mem_trim",
      freedMb: round1(rssBeforeMb - rssAfterMb),
      released: released === 1,
      rssAfterMb,
      rssBeforeMb,
    });
  } catch (error) {
    logger.warn(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        event: "mem_trim_failed",
      }),
    );
  }
}

export async function startMallocTrim(loader = loadMallocTrim) {
  if (!isMallocTrimEnabled() || trimStarted) return;
  trimStarted = true;

  const trim = await loader();
  if (!trim) return;

  const intervalMs = envNumber(
    "MALLOC_TRIM_INTERVAL_MS",
    DEFAULT_INTERVAL_MS,
    60_000,
  );
  const minRssMb = envNumber("MALLOC_TRIM_MIN_RSS_MB", DEFAULT_MIN_RSS_MB, 0);

  safeLog({ event: "mem_trim_boot", intervalMs, minRssMb });

  trimTimer = setInterval(
    () =>
      runMallocTrimTick({
        minRssMb,
        now: () => performance.now(),
        readRss: () => process.memoryUsage.rss(),
        trim,
      }),
    intervalMs,
  );
  trimTimer.unref();
}

// So para testes: permite reiniciar no mesmo processo.
export function stopMallocTrimForTest() {
  if (trimTimer) clearInterval(trimTimer);
  trimTimer = null;
  trimStarted = false;
}
