import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetSessionStartedEmissionGuardForTests,
  beginSessionStartedEmission,
  markSessionStartedEmitted,
  markSessionStartedFailed,
} from "./session-started-guard";

describe("session-started-guard", () => {
  beforeEach(() => {
    __resetSessionStartedEmissionGuardForTests();
    sessionStorage.clear();
  });

  it("blocks begin when posthog session id is empty", () => {
    expect(beginSessionStartedEmission(null)).toBe(false);
    expect(beginSessionStartedEmission("")).toBe(false);
    expect(beginSessionStartedEmission("   ")).toBe(false);
  });

  it("allows only one concurrent begin per same posthog session id", async () => {
    const [first, second, third] = await Promise.all([
      Promise.resolve(beginSessionStartedEmission("ph-session-1")),
      Promise.resolve(beginSessionStartedEmission("ph-session-1")),
      Promise.resolve(beginSessionStartedEmission("ph-session-1")),
    ]);

    expect([first, second, third].filter(Boolean)).toHaveLength(1);
  });

  it("blocks re-emission after markSessionStartedEmitted", () => {
    expect(beginSessionStartedEmission("ph-session-1")).toBe(true);
    markSessionStartedEmitted("ph-session-1");

    expect(beginSessionStartedEmission("ph-session-1")).toBe(false);
    expect(
      sessionStorage.getItem("analytics_session_started_posthog_session_id"),
    ).toBe("ph-session-1");
  });

  it("allows retry after markSessionStartedFailed", () => {
    expect(beginSessionStartedEmission("ph-session-1")).toBe(true);
    markSessionStartedFailed("ph-session-1");

    expect(beginSessionStartedEmission("ph-session-1")).toBe(true);
  });

  it("blocks begin when sessionStorage already has same posthog session id", () => {
    sessionStorage.setItem(
      "analytics_session_started_posthog_session_id",
      "ph-session-1",
    );

    expect(beginSessionStartedEmission("ph-session-1")).toBe(false);
  });
});
