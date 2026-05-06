import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPosthogSessionId,
  persistPosthogSessionId,
  waitForPosthogSessionId,
} from "./posthog-session";

describe("posthog session", () => {
  beforeEach(() => {
    sessionStorage.clear();
    delete window.posthog;
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key");
  });

  it("reads session id from storage first", () => {
    sessionStorage.setItem("analytics_posthog_session_id", "ph-storage-1");
    window.posthog = {
      get_session_id: () => "ph-client-1",
    };

    expect(getPosthogSessionId()).toBe("ph-storage-1");
  });

  it("falls back to posthog.get_session_id and persists", () => {
    window.posthog = {
      get_session_id: () => "ph-client-2",
    };

    expect(getPosthogSessionId()).toBe("ph-client-2");
    expect(sessionStorage.getItem("analytics_posthog_session_id")).toBe(
      "ph-client-2",
    );
  });

  it("waits for onSessionId callback when immediate sources are empty", async () => {
    vi.useFakeTimers();

    window.posthog = {
      get_session_id: () => null,
      onSessionId: (callback) => {
        setTimeout(() => callback("ph-callback-3"), 100);
      },
    };

    const pending = waitForPosthogSessionId(500);
    await vi.advanceTimersByTimeAsync(120);

    await expect(pending).resolves.toBe("ph-callback-3");
    expect(sessionStorage.getItem("analytics_posthog_session_id")).toBe(
      "ph-callback-3",
    );

    vi.useRealTimers();
  });

  it("returns null when timeout expires without session id", async () => {
    vi.useFakeTimers();

    window.posthog = {
      get_session_id: () => null,
      onSessionId: () => undefined,
    };

    const pending = waitForPosthogSessionId(100);
    await vi.advanceTimersByTimeAsync(150);

    await expect(pending).resolves.toBeNull();

    vi.useRealTimers();
  });

  it("normalizes and rejects empty session values", () => {
    expect(persistPosthogSessionId("   ")).toBeNull();
    expect(getPosthogSessionId()).toBeNull();
  });
});
