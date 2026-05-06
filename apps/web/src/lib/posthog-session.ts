const POSTHOG_SESSION_ID_STORAGE_KEY = "analytics_posthog_session_id";
const DEFAULT_SESSION_WAIT_MS = 4_000;
const DEFAULT_SESSION_POLL_MS = 50;

type PosthogWebClient = {
  get_session_id?: () => string | null | undefined;
  onSessionId?: (callback: (sessionId: string) => void) => void;
};

declare global {
  interface Window {
    posthog?: PosthogWebClient;
  }
}

function normalizeSessionId(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPosthogSessionRequired() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  return typeof key === "string" && key.length > 0;
}

export function persistPosthogSessionId(raw: unknown): string | null {
  const normalized = normalizeSessionId(raw);
  if (!normalized) {
    return null;
  }

  if (typeof window !== "undefined" && typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(POSTHOG_SESSION_ID_STORAGE_KEY, normalized);
  }

  return normalized;
}

export function getPosthogSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const fromStorage = normalizeSessionId(
    sessionStorage.getItem(POSTHOG_SESSION_ID_STORAGE_KEY),
  );
  if (fromStorage) {
    return fromStorage;
  }

  const fromClient = normalizeSessionId(window.posthog?.get_session_id?.());
  if (fromClient) {
    persistPosthogSessionId(fromClient);
    return fromClient;
  }

  return null;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForPosthogSessionId(
  timeoutMs = DEFAULT_SESSION_WAIT_MS,
): Promise<string | null> {
  const immediate = getPosthogSessionId();
  if (immediate) {
    return immediate;
  }

  if (typeof window === "undefined") {
    return null;
  }

  if (!isPosthogSessionRequired()) {
    return null;
  }

  let resolvedFromCallback: string | null = null;
  window.posthog?.onSessionId?.((sessionId) => {
    const persisted = persistPosthogSessionId(sessionId);
    if (persisted) {
      resolvedFromCallback = persisted;
    }
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = getPosthogSessionId() ?? resolvedFromCallback;
    if (current) {
      return current;
    }
    await wait(DEFAULT_SESSION_POLL_MS);
  }

  return getPosthogSessionId() ?? resolvedFromCallback;
}
