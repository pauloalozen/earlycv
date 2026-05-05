import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());

const initMock = vi.hoisted(() => vi.fn());
const identifyMock = vi.hoisted(() => vi.fn());
const resetMock = vi.hoisted(() => vi.fn());

vi.mock("posthog-js", () => ({
  default: {
    identify: identifyMock,
    init: initMock,
    reset: resetMock,
  },
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
}));

import { PosthogAuthProvider } from "./posthog-auth-provider";

describe("PosthogAuthProvider", () => {
  beforeEach(() => {
    initMock.mockReset();
    identifyMock.mockReset();
    resetMock.mockReset();
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

  it("identifies authenticated user once across strict mode remounts", async () => {
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

    render(
      <StrictMode>
        <PosthogAuthProvider>
          <div>child</div>
        </PosthogAuthProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(initMock).toHaveBeenCalledTimes(1);
      expect(initMock).toHaveBeenCalledWith(
        "phc_test_key",
        expect.objectContaining({
          api_host: "https://us.i.posthog.com",
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          capture_performance: false,
        }),
      );
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
      JSON.stringify({ isAuthenticated: true, userId: "user-1" }),
    );
  });

  it("resets posthog when session becomes anonymous after identified user", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, user: { id: "user-2" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false, user: null }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const first = render(
      <PosthogAuthProvider>
        <div>first</div>
      </PosthogAuthProvider>,
    );

    await waitFor(() => {
      expect(identifyMock).toHaveBeenCalledWith("user-2", {});
    });

    first.unmount();

    render(
      <PosthogAuthProvider>
        <div>second</div>
      </PosthogAuthProvider>,
    );

    await waitFor(() => {
      expect(resetMock).toHaveBeenCalledTimes(1);
    });

    expect(sessionStorage.getItem("posthog_identified_user_id")).toBeNull();
    expect(sessionStorage.getItem("analytics_auth_context")).toBe(
      JSON.stringify({ isAuthenticated: false, userId: null }),
    );
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
    sessionStorage.setItem("posthog_identified_user_id", "user-1");
    sessionStorage.setItem("analytics_auth_session_identified_user_id", "user-1");
    sessionStorage.setItem(
      "analytics_auth_context",
      JSON.stringify({ isAuthenticated: true, userId: "user-1" }),
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
});
