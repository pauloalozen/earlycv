export const VISITOR_LIFECYCLE_CLASSIFICATIONS = [
  "new_visitor",
  "returning_visitor",
  "unknown",
] as const;

export type VisitorLifecycleClassification =
  (typeof VISITOR_LIFECYCLE_CLASSIFICATIONS)[number];

export type VisitorEventSignal = {
  sessionInternalId: string;
  occurredAt: Date;
};

// Classificação canônica de lifecycle de visitante por visitor_id. Pura e
// determinística — dimensão INDEPENDENTE de journey_user_type (ver
// journey-session-classification.ts): um visitor_id pode ser
// returning_visitor com journey_user_type = anonymous_journey (recorrente,
// nunca criou conta) ou new_visitor com journey_user_type = new_user_journey
// (primeira visita já termina em signup). Nunca gravado diretamente nos
// eventos — sempre recalculado a partir do histórico real (ver
// docs/runbook/events.md, seção "Identity model").
//
// Regra: dado o conjunto de sessionInternalId já vistos para este
// visitor_id (todos os eventos que carregam metadata.visitor_id), a sessão
// mais antiga cronologicamente é a "primeira jornada conhecida" daquele
// visitante:
//   - se currentSessionInternalId é essa sessão mais antiga -> new_visitor
//     (nenhuma sessão anterior registrada para este visitor_id).
//   - se existe pelo menos uma sessão diferente e anterior a
//     currentSessionInternalId -> returning_visitor.
//   - sem sinais, ou currentSessionInternalId ausente do histórico ->
//     unknown. Nunca inferido por heurística adicional.
export function classifyVisitorLifecycle(
  currentSessionInternalId: string,
  signals: VisitorEventSignal[],
): VisitorLifecycleClassification {
  const trimmedCurrent = currentSessionInternalId.trim();
  if (!trimmedCurrent || signals.length === 0) {
    return "unknown";
  }

  const sorted = [...signals].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  const firstKnownSessionInternalId = sorted[0]?.sessionInternalId;
  const currentAppears = sorted.some(
    (signal) => signal.sessionInternalId === trimmedCurrent,
  );

  if (!currentAppears) {
    return "unknown";
  }

  return firstKnownSessionInternalId === trimmedCurrent
    ? "new_visitor"
    : "returning_visitor";
}
