import {
  isAnalyticsConsentGateEnabled,
  readAnalyticsConsentState,
} from "@/lib/analytics-consent";

// visitor_id: identidade pseudônima persistente do navegador/dispositivo,
// distinta de sessionInternalId (jornada funcional, ver journey-session.ts)
// e de user_id (conta autenticada). Sobrevive reload, nova aba,
// fechar/reabrir o navegador e novas sessões — mas NÃO limpeza de
// storage/cookies, troca de navegador ou de dispositivo. Fonte canônica
// única: localStorage (mesmo mecanismo já usado por
// analytics_first_touch_utm/analytics_consent_status) — evita depender de
// cookies first-party cross-origin, já que o app web e a API rodam em
// origens diferentes (ver docs/runbook/events.md, seção "Identity model").
// Formato fechado: UUID puro via crypto.randomUUID() — sem fallback tipo
// "visitor-<timestamp>": um dispositivo sem crypto.randomUUID() apenas não
// tem visitor_id (null), nunca inventa um formato alternativo.
export const VISITOR_ID_STORAGE_KEY = "earlycv_visitor_id";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidVisitorId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    return storage &&
      typeof storage.getItem === "function" &&
      typeof storage.setItem === "function"
      ? storage
      : null;
  } catch {
    return null;
  }
}

function canPersistVisitorId(): boolean {
  if (!isAnalyticsConsentGateEnabled()) return true;
  return readAnalyticsConsentState() === "accepted";
}

// Leitura pura — nunca cria nem regenera. Use quando só precisar checar se
// já existe (ex.: telemetria condicional).
export function getVisitorId(): string | null {
  const storage = getLocalStorage();
  if (!storage) return null;

  const existing = storage.getItem(VISITOR_ID_STORAGE_KEY);
  return isValidVisitorId(existing) ? existing : null;
}

// Cria na primeira visita (com consentimento) se ainda não existir, ou se o
// valor persistido for inválido/corrompido. Nunca cria sem consentimento —
// evita gravar identidade persistente antes de o usuário aceitar.
export function getOrCreateVisitorId(): string | null {
  const storage = getLocalStorage();
  if (!storage) return null;

  const existing = storage.getItem(VISITOR_ID_STORAGE_KEY);
  if (isValidVisitorId(existing)) {
    return existing;
  }

  if (!canPersistVisitorId()) {
    return null;
  }

  if (typeof crypto === "undefined" || !("randomUUID" in crypto)) {
    return null;
  }

  const visitorId = crypto.randomUUID();
  storage.setItem(VISITOR_ID_STORAGE_KEY, visitorId);
  return visitorId;
}
