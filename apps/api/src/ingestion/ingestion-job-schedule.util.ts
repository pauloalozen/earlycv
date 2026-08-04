import type { IngestionJobScheduleType } from "@prisma/client";

// America/Sao_Paulo abandonou horario de verao em 2019 — offset fixo
// UTC-3 o ano inteiro, entao a conversao pode ser feita por aritmetica
// direta em vez do truque de toLocaleString usado em cron-utils.ts (que
// depende do fuso horario do runtime). Isso mantem esse modulo puro e
// testavel sem qualquer dependencia de ambiente.
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

type SaoPauloParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
};

function toSaoPauloParts(date: Date): SaoPauloParts {
  const shifted = new Date(date.getTime() - SAO_PAULO_OFFSET_MS);
  return {
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    month: shifted.getUTCMonth(),
    year: shifted.getUTCFullYear(),
  };
}

function fromSaoPauloWallClock(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  return new Date(
    Date.UTC(year, month, day, hour, minute, 0, 0) + SAO_PAULO_OFFSET_MS,
  );
}

export function nextDailyRun(from: Date, hour: number, minute: number): Date {
  const parts = toSaoPauloParts(from);
  let candidate = fromSaoPauloWallClock(
    parts.year,
    parts.month,
    parts.day,
    hour,
    minute,
  );

  if (candidate.getTime() <= from.getTime()) {
    candidate = new Date(candidate.getTime() + ONE_DAY_MS);
  }

  return candidate;
}

export function addHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * ONE_HOUR_MS);
}

export function nextWeeklyRun(
  from: Date,
  daysOfWeek: number[],
  hour: number,
  minute: number,
): Date {
  const allowedDays = new Set(daysOfWeek);

  for (let offset = 0; offset <= 7; offset++) {
    const parts = toSaoPauloParts(
      new Date(from.getTime() + offset * ONE_DAY_MS),
    );

    if (!allowedDays.has(parts.dayOfWeek)) {
      continue;
    }

    const candidate = fromSaoPauloWallClock(
      parts.year,
      parts.month,
      parts.day,
      hour,
      minute,
    );

    if (candidate.getTime() > from.getTime()) {
      return candidate;
    }
  }

  throw new Error("scheduleDaysOfWeek must include at least one valid day");
}

export type IngestionJobScheduleFields = {
  scheduleType: IngestionJobScheduleType;
  scheduleHour: number | null;
  scheduleMinute: number;
  scheduleInterval: number | null;
  scheduleDaysOfWeek: number[];
};

export function calculateNextRunAt(
  job: IngestionJobScheduleFields,
  from: Date,
): Date | null {
  switch (job.scheduleType) {
    case "MANUAL":
      return null;
    case "DAILY":
      if (job.scheduleHour === null) {
        throw new Error("scheduleHour is required for DAILY jobs");
      }
      return nextDailyRun(from, job.scheduleHour, job.scheduleMinute);
    case "EVERY_N_HOURS":
      if (job.scheduleInterval === null) {
        throw new Error("scheduleInterval is required for EVERY_N_HOURS jobs");
      }
      return addHours(from, job.scheduleInterval);
    case "WEEKLY":
      if (job.scheduleHour === null) {
        throw new Error("scheduleHour is required for WEEKLY jobs");
      }
      return nextWeeklyRun(
        from,
        job.scheduleDaysOfWeek,
        job.scheduleHour,
        job.scheduleMinute,
      );
    default:
      throw new Error(
        `unsupported scheduleType: ${job.scheduleType satisfies never}`,
      );
  }
}
