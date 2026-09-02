import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JOB_NAVIGATION_CONTEXT_STORAGE_KEY,
  JOURNEY_PREVIOUS_ROUTE_STORAGE_KEY,
  readJobNavigationContext,
  resolveJobProductOrigin,
  writeJobNavigationContext,
} from "./journey-session";

describe("job navigation context marker", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves the origin written for the same jobId right after the click", () => {
    writeJobNavigationContext("job-1", "radar");

    expect(readJobNavigationContext("job-1")).toBe("radar");
  });

  it("resolves monitor/monitor_email origins the same way", () => {
    writeJobNavigationContext("job-1", "monitor");
    expect(readJobNavigationContext("job-1")).toBe("monitor");

    writeJobNavigationContext("job-1", "monitor_email");
    expect(readJobNavigationContext("job-1")).toBe("monitor_email");
  });

  it("is a peek — NOT removed from storage after being read, so multiple consumers on the same page agree", () => {
    writeJobNavigationContext("job-1", "radar");

    readJobNavigationContext("job-1");

    expect(
      sessionStorage.getItem(JOB_NAVIGATION_CONTEXT_STORAGE_KEY),
    ).not.toBeNull();
    expect(readJobNavigationContext("job-1")).toBe("radar");
  });

  it("ignores a marker written for a different jobId — never classifies an unrelated navigation as its origin", () => {
    writeJobNavigationContext("job-1", "radar");

    expect(readJobNavigationContext("job-2")).toBeNull();
  });

  it("ignores a stale marker past its TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    writeJobNavigationContext("job-1", "radar");

    vi.setSystemTime(60_000);

    expect(readJobNavigationContext("job-1")).toBeNull();
  });

  it("returns null and does not throw when there is no marker at all", () => {
    expect(readJobNavigationContext("job-1")).toBeNull();
  });
});

describe("resolveJobProductOrigin", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("prefers the click marker over previousRoute, even when previousRoute would resolve to something else", () => {
    sessionStorage.setItem(JOURNEY_PREVIOUS_ROUTE_STORAGE_KEY, "/candidaturas");
    writeJobNavigationContext("job-1", "monitor");

    expect(resolveJobProductOrigin("job-1")).toBe("monitor");
  });

  it("falls back to /radar prefix matching on previousRoute when there is no marker", () => {
    sessionStorage.setItem(
      JOURNEY_PREVIOUS_ROUTE_STORAGE_KEY,
      "/radar/area/dados",
    );

    expect(resolveJobProductOrigin("job-1")).toBe("radar");
  });

  it("falls back to /alerta-vaga-certa prefix matching on previousRoute when there is no marker", () => {
    sessionStorage.setItem(
      JOURNEY_PREVIOUS_ROUTE_STORAGE_KEY,
      "/alerta-vaga-certa",
    );

    expect(resolveJobProductOrigin("job-1")).toBe("monitor");
  });

  it("resolves seo_job on the first pageview of the session (no previousRoute, no marker)", () => {
    expect(resolveJobProductOrigin("job-1")).toBe("seo_job");
  });

  it("resolves direct when previousRoute exists but matches no known prefix", () => {
    sessionStorage.setItem(JOURNEY_PREVIOUS_ROUTE_STORAGE_KEY, "/candidaturas");

    expect(resolveJobProductOrigin("job-1")).toBe("direct");
  });
});
