export type AnalyticsConsentState = "unknown" | "accepted" | "denied";

const CONSENT_STORAGE_KEY = "analytics_consent_status";
const CONSENT_CHANGED_EVENT = "analytics-consent-changed";
const CONSENT_PREFERENCES_OPEN_EVENT = "analytics-consent-preferences-open";
const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

type PersistedConsent = {
  state: Exclude<AnalyticsConsentState, "unknown">;
  savedAt: number;
  expiresAt: number;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function getLocalStorage() {
  if (!isBrowser()) {
    return null;
  }

  const storage = window.localStorage;
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) {
    return null;
  }

  return storage;
}

export function isAnalyticsConsentGateEnabled() {
  return process.env.NEXT_PUBLIC_ANALYTICS_CONSENT_ENABLED !== "false";
}

export function readAnalyticsConsentState(): AnalyticsConsentState {
  if (!isAnalyticsConsentGateEnabled()) {
    return "accepted";
  }

  if (!isBrowser()) {
    return "unknown";
  }

  const storage = getLocalStorage();
  if (!storage) {
    return "unknown";
  }

  const raw = storage.getItem(CONSENT_STORAGE_KEY)?.trim();
  if (!raw) {
    return "unknown";
  }

  if (raw === "accepted" || raw === "denied") {
    return raw;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedConsent>;
    if (parsed.state !== "accepted" && parsed.state !== "denied") {
      return "unknown";
    }

    if (typeof parsed.expiresAt === "number" && parsed.expiresAt <= Date.now()) {
      storage.removeItem(CONSENT_STORAGE_KEY);
      return "unknown";
    }

    return parsed.state;
  } catch {
    return "unknown";
  }
}

function emitConsentChanged(state: AnalyticsConsentState) {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AnalyticsConsentState>(CONSENT_CHANGED_EVENT, {
      detail: state,
    }),
  );
}

function applyGoogleConsent(state: AnalyticsConsentState) {
  if (!isBrowser() || typeof window.gtag !== "function") {
    return;
  }

  const analyticsStorage = state === "accepted" ? "granted" : "denied";
  window.gtag("consent", "update", {
    analytics_storage: analyticsStorage,
  });
}

export function setAnalyticsConsentState(state: Exclude<AnalyticsConsentState, "unknown">) {
  if (!isBrowser()) {
    return;
  }

  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  const now = Date.now();
  const payload: PersistedConsent = {
    state,
    savedAt: now,
    expiresAt: now + CONSENT_TTL_MS,
  };

  storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(payload));
  applyGoogleConsent(state);
  emitConsentChanged(state);
}

export function clearAnalyticsConsentStateForTests() {
  if (!isBrowser()) {
    return;
  }

  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(CONSENT_STORAGE_KEY);
}

export function onAnalyticsConsentChanged(
  listener: (state: AnalyticsConsentState) => void,
): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AnalyticsConsentState>).detail;
    listener(detail);
  };

  window.addEventListener(CONSENT_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, handler);
}

export function openAnalyticsConsentPreferences() {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new CustomEvent(CONSENT_PREFERENCES_OPEN_EVENT));
}

export function onAnalyticsConsentPreferencesOpen(listener: () => void): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  window.addEventListener(CONSENT_PREFERENCES_OPEN_EVENT, listener);
  return () => window.removeEventListener(CONSENT_PREFERENCES_OPEN_EVENT, listener);
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}
