export const JOURNEY_SESSION_CLASSIFICATIONS = [
  "anonymous_journey",
  "new_user_journey",
  "existing_user_journey",
  "unknown",
] as const;

export type JourneySessionClassification =
  (typeof JOURNEY_SESSION_CLASSIFICATIONS)[number];

export type JourneySessionEventSignal = {
  eventName: string;
  occurredAt: Date;
  // Vem de metadata.isAuthenticated (getAnalyticsBaseProperties no
  // frontend) — nunca "tem user_id", que classificaria erroneamente
  // como existing_user_journey qualquer sessão que só ficou autenticada
  // DEPOIS de um signup_completed dentro da própria jornada.
  isAuthenticated: boolean;
};

// Classificação canônica de jornada por sessionInternalId. Pura e
// determinística: dado o mesmo conjunto de sinais, sempre o mesmo
// resultado — não depende de estado externo, só da ordem cronológica
// dos eventos da sessão.
//
// Prioridade:
//   1. signup_completed em algum ponto da sessão -> new_user_journey
//      (a conta NÃO existia antes; nasceu nesta jornada).
//   2. login_completed (autenticação explícita, sem signup_completed
//      nessa sessão) -> existing_user_journey.
//   3. Primeiro evento da sessão já chega autenticado (sem
//      login_completed/signup_completed) -> a pessoa entrou com sessão
//      válida de uma conta que já existia antes -> existing_user_journey.
//   4. Nenhum evento da sessão jamais autenticado -> anonymous_journey.
//   5. Qualquer outro caso (ex.: virou autenticado no meio da sessão sem
//      login_completed/signup_completed observável -- sessionInternalId
//      reaproveitado entre abas, corrida de eventos, dado incompleto)
//      -> unknown. Nunca inferido por heurística adicional.
//
// auth_session_identified é deliberadamente ignorado aqui -- é evento
// técnico, não prova nem de novo cadastro nem de login.
export function classifyJourneySession(
  signals: JourneySessionEventSignal[],
): JourneySessionClassification {
  if (signals.length === 0) {
    return "unknown";
  }

  const sorted = [...signals].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  const hasSignupCompleted = sorted.some(
    (signal) => signal.eventName === "signup_completed",
  );
  const hasLoginCompleted = sorted.some(
    (signal) => signal.eventName === "login_completed",
  );

  if (hasSignupCompleted && hasLoginCompleted) {
    // Sinal contraditório dentro da mesma sessão -- não inventamos qual
    // prevalece.
    return "unknown";
  }

  if (hasSignupCompleted) {
    return "new_user_journey";
  }

  if (hasLoginCompleted) {
    return "existing_user_journey";
  }

  const startedAuthenticated = sorted[0]?.isAuthenticated === true;
  if (startedAuthenticated) {
    return "existing_user_journey";
  }

  const everAuthenticated = sorted.some(
    (signal) => signal.isAuthenticated === true,
  );
  if (!everAuthenticated) {
    return "anonymous_journey";
  }

  return "unknown";
}
