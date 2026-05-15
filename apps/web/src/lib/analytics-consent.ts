export type AnalyticsConsentState = "unknown" | "accepted" | "denied";

const CONSENT_STORAGE_KEY = "analytics_consent_status";
const CONSENT_CHANGED_EVENT = "analytics-consent-changed";

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
  if (raw === "accepted" || raw === "denied") {
    return raw;
  }
  return "unknown";
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

  storage.setItem(CONSENT_STORAGE_KEY, state);
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

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}
