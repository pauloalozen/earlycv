import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeRadarJobNavigationContext,
  RADAR_JOB_NAVIGATION_CONTEXT_STORAGE_KEY,
  writeRadarJobNavigationContext,
} from "./journey-session";

describe("radar job navigation context marker", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves radar for the same jobId right after the click", () => {
    writeRadarJobNavigationContext("job-1");

    expect(consumeRadarJobNavigationContext("job-1")).toBe("radar");
  });

  it("is removed from storage after a successful consumption", () => {
    writeRadarJobNavigationContext("job-1");

    consumeRadarJobNavigationContext("job-1");

    expect(
      sessionStorage.getItem(RADAR_JOB_NAVIGATION_CONTEXT_STORAGE_KEY),
    ).toBeNull();
  });

  it("ignores a marker written for a different jobId — never classifies an unrelated navigation as radar", () => {
    writeRadarJobNavigationContext("job-1");

    expect(consumeRadarJobNavigationContext("job-2")).toBeNull();
  });

  it("removes the marker even when the jobId does not match, so it cannot leak into a later navigation", () => {
    writeRadarJobNavigationContext("job-1");

    consumeRadarJobNavigationContext("job-2");

    expect(
      sessionStorage.getItem(RADAR_JOB_NAVIGATION_CONTEXT_STORAGE_KEY),
    ).toBeNull();
  });

  it("ignores a stale marker past its TTL — never classifies a future unrelated navigation as radar", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    writeRadarJobNavigationContext("job-1");

    vi.setSystemTime(60_000);

    expect(consumeRadarJobNavigationContext("job-1")).toBeNull();
  });

  it("returns null and does not throw when there is no marker at all", () => {
    expect(consumeRadarJobNavigationContext("job-1")).toBeNull();
  });
});
