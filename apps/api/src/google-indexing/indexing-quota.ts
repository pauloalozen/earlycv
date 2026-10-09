import type { DatabaseService } from "../database/database.service";

// Cota diária da Indexing API: 200 publicações por dia, somando URL_UPDATED
// e URL_DELETED. GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT (nome histórico, de
// quando só o backfill contava) continua valendo como override.
export const DEFAULT_INDEXING_DAILY_LIMIT = 200;

export function getIndexingDailyLimit(): number {
  const raw = process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_INDEXING_DAILY_LIMIT;
}

const PACIFIC_TIME_ZONE = "America/Los_Angeles";

// Offset (ms) do horário do Pacífico em relação ao UTC num instante: -7h no
// horário de verão, -8h fora dele.
function pacificOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: PACIFIC_TIME_ZONE,
    year: "numeric",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

// A cota do Google zera à meia-noite no horário do Pacífico, não no de
// Brasília: contar pelo dia de São Paulo deixava a conta 4 a 5 horas fora.
export function startOfPacificDay(now: Date): Date {
  const offset = pacificOffsetMs(now);
  const local = new Date(now.getTime() + offset);
  const startLocalUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  // Recalcula o offset no início do dia (troca de horário de verão no meio
  // do dia não muda o resultado em mais de 1 hora, mas fica exato).
  const guess = new Date(startLocalUtc - offset);
  return new Date(startLocalUtc - pacificOffsetMs(guess));
}

export async function countIndexingSentToday(
  database: Pick<DatabaseService, "googleIndexingLog">,
  now = new Date(),
): Promise<number> {
  return database.googleIndexingLog.count({
    where: {
      createdAt: { gte: startOfPacificDay(now) },
      status: "SUCCESS",
    },
  });
}
