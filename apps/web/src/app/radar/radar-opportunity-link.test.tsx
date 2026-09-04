import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());
const writeJobNavigationContextMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
}));
vi.mock("@/lib/journey-session", () => ({
  writeJobNavigationContext: writeJobNavigationContextMock,
}));

import { RadarOpportunityLink } from "./radar-opportunity-link";

describe("RadarOpportunityLink", () => {
  beforeEach(() => {
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    writeJobNavigationContextMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("emits radar_opportunity_clicked with job_id and product_origin=radar on click", () => {
    render(
      <RadarOpportunityLink href="/radar/vaga-1" jobId="job-1">
        Vaga 1
      </RadarOpportunityLink>,
    );

    fireEvent.click(screen.getByText("Vaga 1"));

    expect(trackEventMock).toHaveBeenCalledTimes(1);
    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.eventName).toBe("radar_opportunity_clicked");
    expect(call.properties).toMatchObject({
      job_id: "job-1",
      product_origin: "radar",
    });
  });

  it("includes position and active_filters only when actually provided", () => {
    render(
      <RadarOpportunityLink
        href="/radar/vaga-2"
        jobId="job-2"
        position={3}
        activeFilters={{ seniority: "SENIOR", remote: true }}
      >
        Vaga 2
      </RadarOpportunityLink>,
    );

    fireEvent.click(screen.getByText("Vaga 2"));

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.properties).toMatchObject({
      position: 3,
      active_filters: { seniority: "SENIOR", remote: true },
    });
  });

  it("omits position and active_filters when not provided, instead of sending fictitious values", () => {
    render(
      <RadarOpportunityLink href="/radar/vaga-3" jobId="job-3">
        Vaga 3
      </RadarOpportunityLink>,
    );

    fireEvent.click(screen.getByText("Vaga 3"));

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.properties).not.toHaveProperty("position");
    expect(call.properties).not.toHaveProperty("active_filters");
  });

  it("does not globally dedupe — two distinct clicks emit two distinct events", () => {
    render(
      <RadarOpportunityLink href="/radar/vaga-4" jobId="job-4">
        Vaga 4
      </RadarOpportunityLink>,
    );

    const link = screen.getByText("Vaga 4");
    fireEvent.click(link);
    fireEvent.click(link);

    expect(trackEventMock).toHaveBeenCalledTimes(2);
  });

  it("writes the radar click marker for the clicked jobId before the destination page mounts", () => {
    render(
      <RadarOpportunityLink href="/radar/vaga-5" jobId="job-5">
        Vaga 5
      </RadarOpportunityLink>,
    );

    fireEvent.click(screen.getByText("Vaga 5"));

    expect(writeJobNavigationContextMock).toHaveBeenCalledWith(
      "job-5",
      "radar",
    );
  });
});
