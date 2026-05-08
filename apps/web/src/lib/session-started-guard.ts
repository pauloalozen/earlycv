const SESSION_STARTED_POSTHOG_SESSION_STORAGE_KEY =
  "analytics_session_started_posthog_session_id";

const emittedPosthogSessionIds = new Set<string>();
const inFlightPosthogSessionIds = new Set<string>();

function normalizePosthogSessionId(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function getStoredPosthogSessionId(): string {
  if (typeof sessionStorage === "undefined") {
    return "";
  }

  return normalizePosthogSessionId(
    sessionStorage.getItem(SESSION_STARTED_POSTHOG_SESSION_STORAGE_KEY),
  );
}

export function beginSessionStartedEmission(
  posthogSessionId: string | null | undefined,
): boolean {
  const normalizedPosthogSessionId =
    normalizePosthogSessionId(posthogSessionId);
  if (!normalizedPosthogSessionId) {
    return false;
  }

  if (getStoredPosthogSessionId() === normalizedPosthogSessionId) {
    emittedPosthogSessionIds.add(normalizedPosthogSessionId);
    return false;
  }

  if (emittedPosthogSessionIds.has(normalizedPosthogSessionId)) {
    return false;
  }

  if (inFlightPosthogSessionIds.has(normalizedPosthogSessionId)) {
    return false;
  }

  inFlightPosthogSessionIds.add(normalizedPosthogSessionId);
  return true;
}

export function markSessionStartedEmitted(
  posthogSessionId: string | null | undefined,
): void {
  const normalizedPosthogSessionId =
    normalizePosthogSessionId(posthogSessionId);
  if (!normalizedPosthogSessionId) {
    return;
  }

  inFlightPosthogSessionIds.delete(normalizedPosthogSessionId);
  emittedPosthogSessionIds.add(normalizedPosthogSessionId);

  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(
      SESSION_STARTED_POSTHOG_SESSION_STORAGE_KEY,
      normalizedPosthogSessionId,
    );
  }
}

export function markSessionStartedFailed(
  posthogSessionId: string | null | undefined,
): void {
  const normalizedPosthogSessionId =
    normalizePosthogSessionId(posthogSessionId);
  if (!normalizedPosthogSessionId) {
    return;
  }

  inFlightPosthogSessionIds.delete(normalizedPosthogSessionId);
}

export function __resetSessionStartedEmissionGuardForTests(): void {
  emittedPosthogSessionIds.clear();
  inFlightPosthogSessionIds.clear();
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(SESSION_STARTED_POSTHOG_SESSION_STORAGE_KEY);
  }
}
