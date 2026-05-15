import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAnalyticsConsentStateForTests,
  readAnalyticsConsentState,
  setAnalyticsConsentState,
} from "./analytics-consent";

describe("analytics-consent", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
    vi.useRealTimers();
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_CONSENT_ENABLED", "true");
    clearAnalyticsConsentStateForTests();
  });

  it("persists consent decision and reads it back", () => {
    setAnalyticsConsentState("accepted");
    expect(readAnalyticsConsentState()).toBe("accepted");
  });

  it("expires persisted consent after 12 months", () => {
    vi.useFakeTimers();
    const base = new Date("2026-01-01T00:00:00.000Z");
    vi.setSystemTime(base);

    setAnalyticsConsentState("denied");
    expect(readAnalyticsConsentState()).toBe("denied");

    vi.setSystemTime(new Date("2027-01-02T00:00:00.000Z"));
    expect(readAnalyticsConsentState()).toBe("unknown");
  });
});
