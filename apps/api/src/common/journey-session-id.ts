// Formato do UUID de jornada gerado no frontend (buildSessionInternalId em
// apps/web/src/lib/analytics-tracking.ts): crypto.randomUUID(), ou o
// fallback journey-<timestamp> quando crypto.randomUUID não existe.
// Compartilhado entre o middleware de contexto de requisição e o fluxo de
// cookies OAuth — mesma validação rigorosa nas duas pontas, nunca inferida.
export const JOURNEY_SESSION_ID_HEADER = "x-session-internal-id";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOURNEY_FALLBACK_PATTERN = /^journey-[0-9]{10,20}$/;
const MAX_LENGTH = 128;

export function isValidJourneySessionInternalId(
  value: unknown,
): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_LENGTH) return false;
  return UUID_PATTERN.test(value) || JOURNEY_FALLBACK_PATTERN.test(value);
}
