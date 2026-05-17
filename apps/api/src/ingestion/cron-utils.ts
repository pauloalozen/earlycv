function parsePart(part: string, value: number) {
  if (part === "*") {
    return true;
  }

  if (part.includes("/")) {
    const [base, stepRaw] = part.split("/");
    const step = Number(stepRaw);

    if (base !== "*" || !Number.isInteger(step) || step < 1) {
      return false;
    }

    return value % step === 0;
  }

  const numeric = Number(part);
  return Number.isInteger(numeric) && numeric === value;
}

export function isCronExpressionValid(cron: string) {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  const date = new Date("2026-01-01T10:15:00Z");
  return doesCronMatchDate(cron, date);
}

export function doesCronMatchDate(cron: string, date: Date) {
  const parts = cron.trim().split(/\s+/);

  if (parts.length !== 5) {
    return false;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const inSaoPaulo = new Date(
    date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );

  return (
    parsePart(minute, inSaoPaulo.getMinutes()) &&
    parsePart(hour, inSaoPaulo.getHours()) &&
    parsePart(dayOfMonth, inSaoPaulo.getDate()) &&
    parsePart(month, inSaoPaulo.getMonth() + 1) &&
    parsePart(dayOfWeek, inSaoPaulo.getDay())
  );
}
