// scheduledFor não é "quando o cron rodou" — é o início (UTC) do período
// que o digest representa, e é essa data que entra na chave de
// idempotência @@unique([userId, frequency, scheduledFor]) em
// MonitorDigest. DAILY usa o dia corrente; WEEKLY usa a segunda-feira ISO
// da semana corrente (âncora fixa e determinística, não "7 dias atrás").
export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

// Segunda-feira (ISO) da semana de `now`, à meia-noite UTC. getUTCDay()
// retorna 0=domingo..6=sábado; a distância até a segunda mais próxima
// (pra trás) é (day + 6) % 7.
export function startOfIsoWeekUtc(now: Date): Date {
  const day = now.getUTCDay();
  const distanceToMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - distanceToMonday);
  return monday;
}

// Dia em que o digest WEEKLY é processado — segunda-feira. Fixo por
// simplicidade nesta fase (spec não pede configuração de dia/frequência de
// alerta além de DAILY/WEEKLY/OFF).
export function isWeeklyDigestDay(now: Date): boolean {
  return now.getUTCDay() === 1;
}
