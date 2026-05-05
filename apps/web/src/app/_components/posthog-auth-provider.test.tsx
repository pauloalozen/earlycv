import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { PosthogAuthProvider } from "./posthog-auth-provider";

describe("PosthogAuthProvider", () => {
  beforeEach(() => {
    initMock.mockReset();
    identifyMock.mockReset();
    resetMock.mockReset();
    sessionStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
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
      expect(identifyMock).toHaveBeenCalledTimes(1);
      expect(identifyMock).toHaveBeenCalledWith("user-1", {
        name: "User 1",
      });
    });

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
});
