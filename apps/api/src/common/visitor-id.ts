// visitor_id: identificador pseudônimo persistente de navegador/dispositivo,
// gerado no frontend por crypto.randomUUID() (apps/web/src/lib/visitor-id.ts)
// e persistido em localStorage — sobrevive reload/nova aba/fechar-reabrir o
// navegador, mas NUNCA limpeza de storage/troca de navegador/dispositivo
// (não é fingerprinting, não deriva de IP/user-agent/email/telefone).
// Formato fechado: UUID puro, sem prefixo — mesma forma de sessionInternalId
// no caso comum, mas semanticamente distinto (ver docs/runbook/events.md,
// seção "Identity model"). Compartilhado entre o middleware de contexto de
// requisição e o relay de cookies OAuth — mesma validação rigorosa nas duas
// pontas, nunca inferido.
export const VISITOR_ID_HEADER = "x-visitor-id";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LENGTH = 128;

export function isValidVisitorId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_LENGTH) return false;
  return UUID_PATTERN.test(value);
}
