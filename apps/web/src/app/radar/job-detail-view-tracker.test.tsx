import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());
const getJourneyRouteVisitIdMock = vi.hoisted(() => vi.fn());
const getJourneyPreviousRouteMock = vi.hoisted(() => vi.fn());
const consumeRadarJobNavigationContextMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
}));
vi.mock("@/lib/journey-session", () => ({
  getJourneyRouteVisitId: getJourneyRouteVisitIdMock,
  getJourneyPreviousRoute: getJourneyPreviousRouteMock,
  consumeRadarJobNavigationContext: consumeRadarJobNavigationContextMock,
}));

import { JobDetailViewTracker } from "./job-detail-view-tracker";

describe("JobDetailViewTracker", () => {
  beforeEach(() => {
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    getJourneyRouteVisitIdMock.mockReset();
    getJourneyRouteVisitIdMock.mockReturnValue("route-visit-detail-1");
    getJourneyPreviousRouteMock.mockReset();
    consumeRadarJobNavigationContextMock.mockReset();
    consumeRadarJobNavigationContextMock.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it("emits job_detail_viewed with product_origin=radar when coming from a /radar route", () => {
    getJourneyPreviousRouteMock.mockReturnValue("/radar/area/dados");

    render(<JobDetailViewTracker jobId="job-1" />);

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.eventName).toBe("job_detail_viewed");
    expect(call.properties).toMatchObject({
      job_id: "job-1",
      product_origin: "radar",
    });
  });

  it("resolves product_origin=seo_job on the first pageview of the session (no previous route)", () => {
    getJourneyPreviousRouteMock.mockReturnValue(null);

    render(<JobDetailViewTracker jobId="job-2" />);

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.properties).toMatchObject({ product_origin: "seo_job" });
  });

  it("resolves product_origin=direct when the previous route exists but is not /radar", () => {
    getJourneyPreviousRouteMock.mockReturnValue("/candidaturas");

    render(<JobDetailViewTracker jobId="job-3" />);

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.properties).toMatchObject({ product_origin: "direct" });
  });

  it("is idempotent by routeVisitId + job_detail_viewed", () => {
    getJourneyPreviousRouteMock.mockReturnValue("/radar");

    render(<JobDetailViewTracker jobId="job-4" />);

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.idempotencyKey).toBe("route-visit-detail-1:job_detail_viewed");
  });

  it("prefers the radar click marker over previousRoute, even when previousRoute would resolve to direct", () => {
    // previousRoute é escrito de forma assíncrona pelo JourneyTrackerProvider
    // e pode ainda não refletir a navegação atual quando este efeito roda
    // (child-before-parent effect ordering) — o marcador síncrono do clique
    // deve vencer sempre que presente e válido.
    getJourneyPreviousRouteMock.mockReturnValue("/candidaturas");
    consumeRadarJobNavigationContextMock.mockReturnValue("radar");

    render(<JobDetailViewTracker jobId="job-5" />);

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.properties).toMatchObject({ product_origin: "radar" });
  });

  it("consumes the marker scoped to its own jobId", () => {
    render(<JobDetailViewTracker jobId="job-6" />);

    expect(consumeRadarJobNavigationContextMock).toHaveBeenCalledWith("job-6");
  });

  it("falls back to previousRoute-based resolution when the marker is absent/stale/mismatched", () => {
    consumeRadarJobNavigationContextMock.mockReturnValue(null);
    getJourneyPreviousRouteMock.mockReturnValue("/radar/area/dados");

    render(<JobDetailViewTracker jobId="job-7" />);

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.properties).toMatchObject({ product_origin: "radar" });
  });
});
