import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());
const getJourneyRouteVisitIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
}));
vi.mock("@/lib/journey-session", () => ({
  getJourneyRouteVisitId: getJourneyRouteVisitIdMock,
}));

import { RadarViewTracker } from "./radar-view-tracker";

describe("RadarViewTracker", () => {
  beforeEach(() => {
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    getJourneyRouteVisitIdMock.mockReset();
    getJourneyRouteVisitIdMock.mockReturnValue("route-visit-1");
  });

  afterEach(() => {
    cleanup();
  });

  it("emits radar_view on /radar with radar_view_type=all and no fictitious filter properties", () => {
    render(<RadarViewTracker radarViewType="all" />);

    expect(trackEventMock).toHaveBeenCalledTimes(1);
    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.eventName).toBe("radar_view");
    expect(call.properties).toEqual({ radar_view_type: "all" });
  });

  it("emits radar_view with only the properties actually available on a filtered route", () => {
    render(
      <RadarViewTracker
        radarViewType="area"
        area="DATA_AI"
        seniority={undefined}
        technology={undefined}
      />,
    );

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.properties).toEqual({
      radar_view_type: "area",
      area: "DATA_AI",
    });
  });

  it("is idempotent by routeVisitId + radar_view — same routeVisitId always produces the same idempotencyKey", () => {
    render(<RadarViewTracker radarViewType="junior" seniority="JUNIOR" />);

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.idempotencyKey).toBe("route-visit-1:radar_view");
  });

  it("omits idempotencyKey when there is no routeVisitId yet, instead of fabricating one", () => {
    getJourneyRouteVisitIdMock.mockReturnValue(null);

    render(<RadarViewTracker radarViewType="remote" remoteFilter />);

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.idempotencyKey).toBeUndefined();
  });

  it("does not re-emit on re-render within the same mount (no duplicate radar_view for the same routeVisitId)", () => {
    const { rerender } = render(
      <RadarViewTracker radarViewType="senior" seniority="SENIOR" />,
    );
    rerender(<RadarViewTracker radarViewType="senior" seniority="SENIOR" />);

    expect(trackEventMock).toHaveBeenCalledTimes(1);
  });
});
