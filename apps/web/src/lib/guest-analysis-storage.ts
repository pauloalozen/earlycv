const GUEST_ANALYSIS_KEY = "guestAnalysis";

function safeGet(storage: Storage): string | null {
  try {
    return storage.getItem(GUEST_ANALYSIS_KEY);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, value: string) {
  try {
    storage.setItem(GUEST_ANALYSIS_KEY, value);
  } catch {
    return;
  }
}

function safeRemove(storage: Storage) {
  try {
    storage.removeItem(GUEST_ANALYSIS_KEY);
  } catch {
    return;
  }
}

export function getGuestAnalysisRaw(): string | null {
  if (typeof window === "undefined") return null;
  return safeGet(window.sessionStorage) ?? safeGet(window.localStorage);
}

export function setGuestAnalysisRaw(value: string) {
  if (typeof window === "undefined") return;
  safeSet(window.sessionStorage, value);
  safeSet(window.localStorage, value);
}

export function clearGuestAnalysisRaw() {
  if (typeof window === "undefined") return;
  safeRemove(window.sessionStorage);
  safeRemove(window.localStorage);
}
