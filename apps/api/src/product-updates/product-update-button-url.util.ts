// Validação da URL do botão principal do e-mail — aceita só URL absoluta
// https, nunca javascript:/data:/http:/relativa, e nunca aceita caracteres
// capazes de quebrar o atributo HTML `href="..."` mesmo antes do escaping
// de defesa em profundidade aplicado em product-update-email-layout.ts
// (renderPrimaryButton escapa de qualquer forma — isto aqui é a primeira
// barreira, não a única). Reaproveitado tanto pelo DTO (feedback imediato
// de validação HTTP, ver dto/is-safe-button-url.validator.ts) quanto pelo
// ProductUpdatesService (nunca confia só no DTO — qualquer outro caller
// precisa passar pela mesma checagem antes de persistir).
const UNSAFE_CHARACTERS = /["'<>\s]/;

export function isSafeProductUpdateButtonUrl(value: string): boolean {
  if (UNSAFE_CHARACTERS.test(value)) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // new URL() lança pra qualquer coisa que não seja uma URL absoluta
    // (relativa, string qualquer) — é isso que rejeita "URL relativa" e
    // strings inválidas sem precisar de um allowlist de formato à parte.
    return false;
  }

  return parsed.protocol === "https:";
}
