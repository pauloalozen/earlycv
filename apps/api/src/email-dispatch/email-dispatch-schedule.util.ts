import {
  BRASILIA_UTC_OFFSET_MS,
  FEEDBACK_DELAY_AFTER_SIGNUP_MS,
  FEEDBACK_MIN_GAP_AFTER_WELCOME_MS,
  FEEDBACK_WINDOW_END_HOUR,
  FEEDBACK_WINDOW_START_HOUR,
  HOUR_MS,
} from "./email-dispatch.constants";

// Dentro de 08:00–20:00 (Brasília) devolve o mesmo instante; fora, o
// próximo 08:00 de Brasília (mesmo dia se ainda é de madrugada, dia
// seguinte se já passou das 20h).
export function adjustToFeedbackWindow(date: Date): Date {
  const local = new Date(date.getTime() - BRASILIA_UTC_OFFSET_MS);
  const hour = local.getUTCHours();

  if (hour >= FEEDBACK_WINDOW_START_HOUR && hour < FEEDBACK_WINDOW_END_HOUR) {
    return date;
  }

  const localDayStart = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  const nextWindowStartLocal =
    hour < FEEDBACK_WINDOW_START_HOUR
      ? localDayStart + FEEDBACK_WINDOW_START_HOUR * HOUR_MS
      : localDayStart + (24 + FEEDBACK_WINDOW_START_HOUR) * HOUR_MS;

  return new Date(nextWindowStartLocal + BRASILIA_UTC_OFFSET_MS);
}

// 24h após o cadastro, mas nunca antes de 12h depois da boas-vindas —
// cobre a verificação tardia (usuário que cadastrou e só verificou o
// e-mail dias depois não recebe boas-vindas e feedback juntos). No caso
// normal (verifica em minutos) vale exatamente "cadastro + 24h".
export function computeFeedbackScheduledFor(input: {
  createdAt: Date;
  welcomeScheduledFor: Date;
}): Date {
  const bySignupAge =
    input.createdAt.getTime() + FEEDBACK_DELAY_AFTER_SIGNUP_MS;
  const byWelcomeGap =
    input.welcomeScheduledFor.getTime() + FEEDBACK_MIN_GAP_AFTER_WELCOME_MS;

  return adjustToFeedbackWindow(new Date(Math.max(bySignupAge, byWelcomeGap)));
}
