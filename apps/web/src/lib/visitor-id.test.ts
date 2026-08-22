import { beforeEach, describe, expect, it, vi } from "vitest";

function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

describe("visitor-id", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: makeLocalStorageStub(),
    });
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_CONSENT_ENABLED", "true");
    window.localStorage.removeItem("analytics_consent_status");
    vi.resetModules();
  });

  it("creates a UUID visitor_id on the first visit when none exists yet", async () => {
    window.localStorage.setItem("analytics_consent_status", "accepted");
    const { getOrCreateVisitorId, VISITOR_ID_STORAGE_KEY } = await import(
      "./visitor-id"
    );

    const visitorId = getOrCreateVisitorId();

    expect(visitorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(window.localStorage.getItem(VISITOR_ID_STORAGE_KEY)).toBe(visitorId);
  });

  it("preserves the same visitor_id across repeated calls (reload/new tab simulate the same effect)", async () => {
    window.localStorage.setItem("analytics_consent_status", "accepted");
    const { getOrCreateVisitorId } = await import("./visitor-id");

    const first = getOrCreateVisitorId();
    const second = getOrCreateVisitorId();
    const third = getOrCreateVisitorId();

    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("regenerates a fresh visitor_id when the stored value is invalid/tampered", async () => {
    window.localStorage.setItem("analytics_consent_status", "accepted");
    const { getOrCreateVisitorId, VISITOR_ID_STORAGE_KEY } = await import(
      "./visitor-id"
    );
    window.localStorage.setItem(
      VISITOR_ID_STORAGE_KEY,
      "<script>evil()</script>",
    );

    const visitorId = getOrCreateVisitorId();

    expect(visitorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(visitorId).not.toBe("<script>evil()</script>");
  });

  it("does not create/persist a visitor_id without consent when the consent gate is enabled", async () => {
    // analytics_consent_status left unset -> readAnalyticsConsentState() = "unknown"
    const { getOrCreateVisitorId, VISITOR_ID_STORAGE_KEY } = await import(
      "./visitor-id"
    );

    const visitorId = getOrCreateVisitorId();

    expect(visitorId).toBeNull();
    expect(window.localStorage.getItem(VISITOR_ID_STORAGE_KEY)).toBeNull();
  });

  it("a fresh storage (simulating a different browser/device) creates a different visitor_id", async () => {
    window.localStorage.setItem("analytics_consent_status", "accepted");
    const { getOrCreateVisitorId } = await import("./visitor-id");
    const first = getOrCreateVisitorId();

    // Simula outro navegador/dispositivo: storage novo, vazio.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: makeLocalStorageStub(),
    });
    window.localStorage.setItem("analytics_consent_status", "accepted");

    const second = getOrCreateVisitorId();

    expect(second).not.toBe(first);
  });

  it("getVisitorId never creates one — pure read", async () => {
    const { getVisitorId, VISITOR_ID_STORAGE_KEY } = await import(
      "./visitor-id"
    );

    expect(getVisitorId()).toBeNull();
    expect(window.localStorage.getItem(VISITOR_ID_STORAGE_KEY)).toBeNull();
  });
});
