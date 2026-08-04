// Converte entre o cron cru de JobSource.scheduleCron e a mesma
// linguagem humana usada no popup de criacao de IngestionJob (Diario /
// A cada N horas / Semanal) — so os 3 padroes gerados pelo proprio form
// sao reconhecidos; qualquer outro cron cai em UNKNOWN e exibe o texto
// cru como fallback.

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export type HumanSchedule =
  | { type: "DAILY"; hour: number; minute: number }
  | { type: "EVERY_N_HOURS"; interval: number; minute: number }
  | { type: "WEEKLY"; hour: number; minute: number; days: number[] }
  | { type: "UNKNOWN"; raw: string };

export function parseCronToHuman(cron: string | null): HumanSchedule {
  if (!cron) {
    return { hour: 7, minute: 0, type: "DAILY" };
  }

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { raw: cron, type: "UNKNOWN" };
  }

  const [minute, hour, day, month, weekday] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];

  if (day !== "*" || month !== "*" || !/^\d+$/.test(minute)) {
    return { raw: cron, type: "UNKNOWN" };
  }

  const hourStepMatch = hour.match(/^\*\/(\d+)$/);
  if (hourStepMatch && weekday === "*") {
    return {
      interval: Number(hourStepMatch[1]),
      minute: Number(minute),
      type: "EVERY_N_HOURS",
    };
  }

  if (/^\d+$/.test(hour)) {
    if (weekday === "*") {
      return { hour: Number(hour), minute: Number(minute), type: "DAILY" };
    }
    const days = weekday
      .split(",")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    if (days.length > 0) {
      return {
        days,
        hour: Number(hour),
        minute: Number(minute),
        type: "WEEKLY",
      };
    }
  }

  return { raw: cron, type: "UNKNOWN" };
}

export function buildCronFromHuman(schedule: HumanSchedule): string {
  switch (schedule.type) {
    case "DAILY":
      return `${schedule.minute} ${schedule.hour} * * *`;
    case "EVERY_N_HOURS":
      return `${schedule.minute} */${schedule.interval} * * *`;
    case "WEEKLY":
      return `${schedule.minute} ${schedule.hour} * * ${schedule.days.join(",")}`;
    case "UNKNOWN":
      return schedule.raw;
  }
}

export function humanScheduleLabel(cron: string | null): string {
  if (!cron) {
    return "-";
  }

  const schedule = parseCronToHuman(cron);
  const hh = "hour" in schedule ? String(schedule.hour).padStart(2, "0") : "00";
  const mm =
    "minute" in schedule ? String(schedule.minute).padStart(2, "0") : "00";

  switch (schedule.type) {
    case "DAILY":
      return `Todo dia às ${hh}:${mm}`;
    case "EVERY_N_HOURS":
      return `A cada ${schedule.interval} horas`;
    case "WEEKLY": {
      const days = schedule.days
        .slice()
        .sort()
        .map((d) => WEEKDAY_LABELS[d])
        .join(", ");
      return `Toda semana (${days}) às ${hh}:${mm}`;
    }
    case "UNKNOWN":
      return schedule.raw;
  }
}
