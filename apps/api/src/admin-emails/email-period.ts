import { BadRequestException } from "@nestjs/common";

export const EMAIL_PERIODS = ["hoje", "semana", "7d", "mes", "30d"] as const;
export type EmailPeriod = (typeof EMAIL_PERIODS)[number];

export type ResolvedEmailWindow = {
  // custom = from/to informados pelo admin.
  period: EmailPeriod | "custom";
  // Dias de calendário (America/Sao_Paulo), ambos inclusivos.
  fromDate: string;
  toDate: string;
  // Intervalo [from, to) em UTC, pronto para o banco.
  from: Date;
  to: Date;
};

// Brasil sem horário de verão desde 2019: offset fixo.
const SP_OFFSET_MS = -3 * 60 * 60_000;
const SP_OFFSET = "-03:00";
const DAY_MS = 24 * 60 * 60_000;
const MAX_CUSTOM_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDateString(utcMidnight: Date): string {
  return utcMidnight.toISOString().slice(0, 10);
}

// "Dia de calendário" de São Paulo como meia-noite UTC desse mesmo dia.
function spToday(now: Date): Date {
  const shifted = new Date(now.getTime() + SP_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ),
  );
}

function parseDate(value: string): Date {
  if (!DATE_RE.test(value)) throw new BadRequestException("data inválida");
  const parsed = new Date(`${value}T00:00:00Z`);
  // Rejeita 2026-02-31 (Date normaliza em vez de falhar).
  if (Number.isNaN(parsed.getTime()) || toDateString(parsed) !== value) {
    throw new BadRequestException("data inválida");
  }
  return parsed;
}

function startOfSpDay(date: string): Date {
  return new Date(`${date}T00:00:00${SP_OFFSET}`);
}

export function resolveEmailWindow(
  input: { period?: EmailPeriod; from?: string; to?: string },
  now: Date = new Date(),
): ResolvedEmailWindow {
  let period: ResolvedEmailWindow["period"];
  let first: Date;
  let last: Date;

  if (input.from || input.to) {
    if (!input.from || !input.to) {
      throw new BadRequestException("informe from e to juntos");
    }
    first = parseDate(input.from);
    last = parseDate(input.to);
    if (first.getTime() > last.getTime()) {
      throw new BadRequestException("from deve ser anterior ou igual a to");
    }
    if ((last.getTime() - first.getTime()) / DAY_MS + 1 > MAX_CUSTOM_DAYS) {
      throw new BadRequestException("intervalo máximo de 366 dias");
    }
    period = "custom";
  } else {
    period = input.period ?? "30d";
    last = spToday(now);
    switch (period) {
      case "hoje":
        first = last;
        break;
      case "semana": {
        // Semana de segunda a domingo; vai da segunda até hoje.
        const sinceMonday = (last.getUTCDay() + 6) % 7;
        first = new Date(last.getTime() - sinceMonday * DAY_MS);
        break;
      }
      case "7d":
        first = new Date(last.getTime() - 6 * DAY_MS);
        break;
      case "mes":
        first = new Date(
          Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1),
        );
        break;
      default:
        first = new Date(last.getTime() - 29 * DAY_MS);
    }
  }

  const fromDate = toDateString(first);
  const toDate = toDateString(last);
  return {
    period,
    fromDate,
    toDate,
    from: startOfSpDay(fromDate),
    to: new Date(startOfSpDay(toDate).getTime() + DAY_MS),
  };
}
