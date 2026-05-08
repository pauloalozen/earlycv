import { cleanup, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());

const initMock = vi.hoisted(() => vi.fn());
const identifyMock = vi.hoisted(() => vi.fn());
const getSessionIdMock = vi.hoisted(() => vi.fn());
const onSessionIdMock = vi.hoisted(() => vi.fn());
const resetMock = vi.hoisted(() => vi.fn());

vi.mock("posthog-js", () => ({
  default: {
    identify: identifyMock,
    init: initMock,
    get_session_id: getSessionIdMock,
    onSessionId: onSessionIdMock,
    reset: resetMock,
  },
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
}));

process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";

import { PosthogAuthProvider } from "./posthog-auth-provider";

describe("PosthogAuthProvider", () => {
  beforeEach(() => {
    cleanup();
    initMock.mockReset();
    identifyMock.mockReset();
    getSessionIdMock.mockReset();
    onSessionIdMock.mockReset();
    resetMock.mockReset();
    getSessionIdMock.mockReturnValue("ph-session-1");
    sessionStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    window.history.replaceState({}, "", "/entrar?tab=entrar");
    sessionStorage.setItem("journey_session_internal_id", "session-journey-1");
    sessionStorage.setItem("journey_current_route_visit_id", "visit-journey-1");
    sessionStorage.setItem("journey_previous_route", "/");
  });

  it("identifies authenticated user once across remounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          authenticated: true,
          user: { id: "user-1", name: "User 1" },
        }),
        ok: true,
      }),
    );

    const first = render(
      <PosthogAuthProvider>
        <div>child</div>
      </PosthogAuthProvider>,
    );

    await waitFor(() => {
      expect(identifyMock).toHaveBeenCalledTimes(1);
    });

    first.unmount();

    render(
      <PosthogAuthProvider>
        <div>child-2</div>
      </PosthogAuthProvider>,
    );

    await waitFor(() => {
      expect(identifyMock).toHaveBeenCalledTimes(1);
      expect(trackEventMock).toHaveBeenCalledTimes(1);
      expect(identifyMock).toHaveBeenCalledWith("user-1", {
        name: "User 1",
      });
    });

    expect(trackEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "auth_session_identified",
        eventVersion: 1,
        properties: expect.objectContaining({
          identified_user_id: "user-1",
          previous_auth_state: "unknown",
          source_detail: "posthog_auth_provider",
        }),
      }),
    );

    expect(sessionStorage.getItem("analytics_auth_context")).toBe(
      JSON.stringify({
        authStatus: "authenticated",
        isAuthenticated: true,
        userId: "user-1",
      }),
    );
    expect(sessionStorage.getItem("analytics_posthog_session_id")).toBe(
      "ph-session-1",
    );
  });

  it("does not reset posthog on transient anonymous response without explicit logout signal", async () => {
    sessionStorage.setItem("posthog_identified_user_id", "user-2");
    sessionStorage.setItem(
      "analytics_auth_context",
      JSON.stringify({
        authStatus: "authenticated",
        isAuthenticated: true,
        userId: "user-2",
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ authenticated: false, user: null }),
      }),
    );

    render(
      <PosthogAuthProvider>
        <div>second</div>
      </PosthogAuthProvider>,
    );

    await waitFor(() => {
      expect(sessionStorage.getItem("analytics_auth_context")).toBe(
        JSON.stringify({
          authStatus: "authenticated",
          isAuthenticated: true,
          userId: "user-2",
        }),
      );
    });

    expect(sessionStorage.getItem("posthog_identified_user_id")).toBe("user-2");
    expect(resetMock).toHaveBeenCalledTimes(0);
  });

  it("resets posthog only when explicit logout signal is present", async () => {
    sessionStorage.setItem("analytics_auth_reset_allowed", "1");
    sessionStorage.setItem("posthog_identified_user_id", "user-2");
    sessionStorage.setItem(
      "analytics_auth_context",
      JSON.stringify({
        authStatus: "authenticated",
        isAuthenticated: true,
        userId: "user-2",
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ authenticated: false, user: null }),
      }),
    );

    render(
      <PosthogAuthProvider>
        <div>logout</div>
      </PosthogAuthProvider>,
    );

    await waitFor(() => {
      expect(resetMock).toHaveBeenCalledTimes(1);
    });

    expect(sessionStorage.getItem("analytics_auth_reset_allowed")).toBeNull();
  });

  it("emits auth_session_identified again after logout then next login", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, user: { id: "user-3" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false, user: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, user: { id: "user-3" } }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const first = render(
      <PosthogAuthProvider>
        <div>first</div>
      </PosthogAuthProvider>,
    );

    await waitFor(() => {
      expect(identifyMock).toHaveBeenCalledWith("user-3", {});
      expect(trackEventMock).toHaveBeenCalledTimes(1);
    });

    first.unmount();

    sessionStorage.setItem("analytics_auth_reset_allowed", "1");

    const second = render(
      <PosthogAuthProvider>
        <div>second</div>
      </PosthogAuthProvider>,
    );

    await waitFor(() => {
      expect(resetMock).toHaveBeenCalledTimes(1);
    });

    second.unmount();

    render(
      <PosthogAuthProvider>
        <div>third</div>
      </PosthogAuthProvider>,
    );

    await waitFor(() => {
      expect(identifyMock).toHaveBeenCalledTimes(2);
      expect(trackEventMock).toHaveBeenCalledTimes(2);
    });
  });

  it("clears stale dedupe on anonymous session and emits again for same user", async () => {
    sessionStorage.setItem("analytics_auth_reset_allowed", "1");
    sessionStorage.setItem("posthog_identified_user_id", "user-1");
    sessionStorage.setItem(
      "analytics_auth_session_identified_user_id",
      "user-1",
    );
    sessionStorage.setItem(
      "analytics_auth_context",
      JSON.stringify({
        authStatus: "authenticated",
        isAuthenticated: true,
        userId: "user-1",
      }),
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false, user: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, user: { id: "user-1" } }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const first = render(
      <PosthogAuthProvider>
        <div>first</div>
      </PosthogAuthProvider>,
    );

    await waitFor(() => {
      expect(resetMock).toHaveBeenCalledTimes(1);
    });

    first.unmount();

    render(
      <PosthogAuthProvider>
        <div>second</div>
      </PosthogAuthProvider>,
    );

    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "auth_session_identified",
          properties: expect.objectContaining({
            identified_user_id: "user-1",
            previous_auth_state: "anonymous",
          }),
        }),
      );
    });
  });

  it("persists posthog session id before auth_session_identified emission", async () => {
    getSessionIdMock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce("ph-session-after-identify");

    const sessionIdAtTrackCall: Array<string | null> = [];
    trackEventMock.mockImplementation(async () => {
      sessionIdAtTrackCall.push(
        sessionStorage.getItem("analytics_posthog_session_id"),
      );
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          authenticated: true,
          user: { id: "user-99", name: "User 99" },
        }),
        ok: true,
      }),
    );

    render(
      <PosthogAuthProvider>
        <div>child</div>
      </PosthogAuthProvider>,
    );

    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledTimes(1);
    });

    expect(sessionIdAtTrackCall).toEqual(["ph-session-after-identify"]);
  });
});
