import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GoogleAuthButton } from "./google-auth-button";

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
  };
}

describe("GoogleAuthButton identity context propagation", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: makeLocalStorageStub(),
    });
  });

  afterEach(() => {
    cleanup();
    sessionStorage.removeItem("journey_session_internal_id");
  });

  it("appends sid and vid to the href when both a journey session and a visitor_id exist", async () => {
    sessionStorage.setItem("journey_session_internal_id", "journey-abc-123");
    localStorage.setItem("analytics_consent_status", "accepted");

    render(<GoogleAuthButton href="/auth/google/start" next="" />);

    await waitFor(() => {
      const link = screen.getByRole("link") as HTMLAnchorElement;
      expect(link.getAttribute("href")).toContain("sid=journey-abc-123");
      expect(link.getAttribute("href")).toMatch(
        /vid=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
    });
  });

  it("never puts visitorId in the URL without consent — falls back to href with only sid, or unmodified href", async () => {
    sessionStorage.setItem("journey_session_internal_id", "journey-abc-123");

    render(<GoogleAuthButton href="/auth/google/start" next="" />);

    await waitFor(() => {
      const link = screen.getByRole("link") as HTMLAnchorElement;
      expect(link.getAttribute("href")).toContain("sid=journey-abc-123");
      expect(link.getAttribute("href")).not.toContain("vid=");
    });
  });

  it("keeps the original href unmodified when neither sid nor vid is available", () => {
    render(<GoogleAuthButton href="/auth/google/start" next="" />);

    const link = screen.getByRole("link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/auth/google/start");
  });
});
