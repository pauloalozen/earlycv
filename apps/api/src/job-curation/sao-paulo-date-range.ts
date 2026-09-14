import { buildSaoPauloUsageDate } from "../plans/analysis-limit";

export type CurationPeriod = "today" | "24h" | "date";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function isValidCalendarDate(dateOnly: string): boolean {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

// Meia-noite em America/Sao_Paulo pra uma data YYYY-MM-DD específica. Mesma
// técnica de buildSaoPauloUsageDate (offset fixo -03:00 — SP não observa
// horário de verão desde 2019, ver google-indexing-backfill.service.ts):
// soma de 24h em UTC não cruza um DST e cai exatamente na meia-noite
// seguinte em SP.
function startOfSaoPauloDate(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00-03:00`);
}

// Intervalo semiaberto [gte, lt) pra filtrar firstSeenAt — nunca monta os
// limites como "00:00Z"/"23:59:59Z", isso seria meia-noite em UTC, não em
// São Paulo.
export function resolveCurationDateRange(
  period: CurationPeriod,
  dateOnly: string | undefined,
  now: Date = new Date(),
): { gte: Date; lt: Date } {
  if (period === "24h") {
    return { gte: new Date(now.getTime() - DAY_MS), lt: now };
  }

  if (period === "date") {
    if (!dateOnly || !DATE_ONLY_PATTERN.test(dateOnly)) {
      throw new Error(
        'Invalid "date" for period=date, expected format YYYY-MM-DD',
      );
    }
    if (!isValidCalendarDate(dateOnly)) {
      throw new Error(`"date" is not a real calendar date: ${dateOnly}`);
    }
    const start = startOfSaoPauloDate(dateOnly);
    return { gte: start, lt: new Date(start.getTime() + DAY_MS) };
  }

  const start = buildSaoPauloUsageDate(now);
  return { gte: start, lt: new Date(start.getTime() + DAY_MS) };
}
