import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());
const getJourneyRouteVisitIdMock = vi.hoisted(() => vi.fn());
const resolveJobProductOriginMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
}));
vi.mock("@/lib/journey-session", () => ({
  getJourneyRouteVisitId: getJourneyRouteVisitIdMock,
  resolveJobProductOrigin: resolveJobProductOriginMock,
}));

import { JobDetailViewTracker } from "./job-detail-view-tracker";

describe("JobDetailViewTracker", () => {
  beforeEach(() => {
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    getJourneyRouteVisitIdMock.mockReset();
    getJourneyRouteVisitIdMock.mockReturnValue("route-visit-detail-1");
    resolveJobProductOriginMock.mockReset();
    resolveJobProductOriginMock.mockReturnValue("direct");
  });

  afterEach(() => {
    cleanup();
  });

  it("emits job_detail_viewed with the origin resolved by resolveJobProductOrigin", () => {
    resolveJobProductOriginMock.mockReturnValue("radar");

    render(<JobDetailViewTracker jobId="job-1" />);

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.eventName).toBe("job_detail_viewed");
    expect(call.properties).toMatchObject({
      job_id: "job-1",
      product_origin: "radar",
    });
  });

  it("resolves the monitor/monitor_email origins the same way", () => {
    resolveJobProductOriginMock.mockReturnValue("monitor_email");

    render(<JobDetailViewTracker jobId="job-2" />);

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.properties).toMatchObject({ product_origin: "monitor_email" });
  });

  it("is idempotent by routeVisitId + job_detail_viewed", () => {
    render(<JobDetailViewTracker jobId="job-4" />);

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.idempotencyKey).toBe("route-visit-detail-1:job_detail_viewed");
  });

  it("resolves the origin scoped to its own jobId", () => {
    render(<JobDetailViewTracker jobId="job-6" />);

    expect(resolveJobProductOriginMock).toHaveBeenCalledWith("job-6");
  });
});
