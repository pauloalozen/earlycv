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

// Dia em que o digest WEEKLY é processado — segunda-feira por padrão,
// editável via MonitorDigestScheduleConfig.weeklyDayOfWeek no admin
// (/admin/alerta-vagas). Parâmetro opcional preserva a assinatura antiga
// (default 1 = segunda) pra quem chama sem configuração.
export function isWeeklyDigestDay(now: Date, weeklyDayOfWeek = 1): boolean {
  return now.getUTCDay() === weeklyDayOfWeek;
}

// "Está na hora configurada de gerar os digests?" — usado pelo
// MonitorDigestScheduler, que agora faz polling a cada minuto em vez de
// um único @Cron fixo, pra poder respeitar um horário editável sem
// reiniciar o serviço. Compara hora/minuto NO FUSO configurado (não UTC
// direto) — é isso que permite o admin configurar "11:00" e ter o
// significado de sempre 11h em America/Sao_Paulo, independente de
// horário de verão.
export function isScheduledDailyMoment(
  now: Date,
  config: { dailyHour: number; dailyMinute: number; timezone: string },
): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "-1");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "-1");
  return hour === config.dailyHour && minute === config.dailyMinute;
}
