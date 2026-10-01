// Conversões puras dos formulários da aba Emails (sem server-only; testáveis).

// O admin informa o cutoff em horário de Brasília (UTC-3 fixo — o Brasil não
// tem horário de verão desde 2019). "YYYY-MM-DDTHH:mm" ↔ ISO UTC.
const BRT_OFFSET_MS = 3 * 60 * 60_000;

// Formato exato do <input type="datetime-local">. O parser de Date do JS é
// leniente (aceita "ontem" como 2000-01-01), então o formato é validado ANTES.
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function brtInputToIso(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !DATETIME_LOCAL.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}:00-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function isoToBrtInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Date(parsed.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 16);
}

// Uma linha (ou vírgula/ponto e vírgula) por endereço; vazios descartados.
// Validação de formato é do backend (mostra o erro de volta ao admin).
export function parseEmailLines(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
