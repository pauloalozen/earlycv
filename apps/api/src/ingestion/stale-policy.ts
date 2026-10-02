// Quando uma vaga ativa que sumiu da fonte é marcada "inactive".
//
// Regra principal: a vaga não apareceu em 2 execuções concluídas seguidas
// (a atual e a anterior) e está há pelo menos 24 h sem ser vista. Em termos
// de lastSeenAt: anterior ao início da execução concluída anterior E
// anterior a now - 24 h. O piso de 24 h existe porque a cadência de crawl é
// por fonte (scheduleCron) — numa fonte que roda de hora em hora, "2
// execuções" seria pouco tempo pra um soluço da fonte derrubar a vaga.
//
// Fallback conservador (o comportamento antigo, 7 dias sem ser vista) quando
// a regra de execuções não é confiável:
//   - não existe execução concluída anterior (primeira execução da fonte);
//   - a execução atual não trouxe nenhuma observação — listagem vazia sem
//     erro é mais provável ser falha silenciosa da fonte do que a empresa
//     ter fechado todas as vagas de uma vez.
export const STALE_MIN_ABSENCE_HOURS = 24;
export const STALE_FALLBACK_DAYS = 7;

const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;

export function getStaleCutoff(input: {
  now: Date;
  observationCount: number;
  previousCompletedRunStartedAt: Date | null;
}): Date {
  const { now, observationCount, previousCompletedRunStartedAt } = input;
  const fallback = new Date(now.getTime() - STALE_FALLBACK_DAYS * DAY_IN_MS);

  if (observationCount === 0 || !previousCompletedRunStartedAt) {
    return fallback;
  }

  const minAbsence = new Date(
    now.getTime() - STALE_MIN_ABSENCE_HOURS * HOUR_IN_MS,
  );
  return previousCompletedRunStartedAt < minAbsence
    ? previousCompletedRunStartedAt
    : minAbsence;
}

export function shouldMarkJobAsStale(job: { lastSeenAt: Date }, cutoff: Date) {
  return job.lastSeenAt.getTime() < cutoff.getTime();
}
