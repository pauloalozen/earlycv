import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn(() => "/"));
const useSearchParamsMock = vi.hoisted(() =>
  vi.fn(() => new URLSearchParams()),
);
const captureAndPersistUtmParamsMock = vi.hoisted(() => vi.fn(() => ({})));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useSearchParams: useSearchParamsMock,
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
  captureAndPersistUtmParams: captureAndPersistUtmParamsMock,
}));

import Template from "./template";

describe("Template journey tracking strict mode", () => {
  beforeEach(() => {
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    usePathnameMock.mockReset();
    captureAndPersistUtmParamsMock.mockReset();
    captureAndPersistUtmParamsMock.mockReturnValue({});
    usePathnameMock.mockReturnValue("/");
    useSearchParamsMock.mockReset();
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not duplicate navigation events in strict mode mount cycle", async () => {
    render(
      <StrictMode>
        <Template>
          <div>child</div>
        </Template>
      </StrictMode>,
    );

    await waitFor(() => {
      const navEvents = trackEventMock.mock.calls
        .map(([payload]) => payload.eventName)
        .filter((name) => name === "page_view" || name === "page_leave");

      expect(navEvents).toEqual(["page_view"]);
    });
  });

  it("emits leave for previous route on remount navigation", async () => {
    usePathnameMock.mockReturnValue("/");

    const firstRender = render(
      <Template>
        <div>home</div>
      </Template>,
    );

    await waitFor(() => {
      const views = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "page_view",
      );

      expect(views.length).toBeGreaterThan(0);
      expect(views[0]?.[0]?.properties?.route).toBe("/");
    });

    firstRender.unmount();
    usePathnameMock.mockReturnValue("/adaptar");

    render(
      <Template>
        <div>adaptar</div>
      </Template>,
    );

    await waitFor(() => {
      const leaves = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "page_leave",
      );
      const views = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "page_view",
      );

      expect(
        leaves.some(([payload]) => payload.properties?.route === "/"),
      ).toBe(true);
      expect(
        views.some(([payload]) => payload.properties?.route === "/adaptar"),
      ).toBe(true);
      const exitEvents = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "site_exit",
      );
      expect(exitEvents).toHaveLength(0);
      const exitCandidateEvents = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "site_exit_candidate",
      );
      expect(exitCandidateEvents).toHaveLength(0);
    });
  });

  it("emits page_leave with origin url and next destination url", async () => {
    window.history.replaceState({}, "", "/?utm_source=linkedin");
    usePathnameMock.mockReturnValue("/");
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("utm_source=linkedin"),
    );

    const first = render(
      <Template>
        <div>home</div>
      </Template>,
    );

    await waitFor(() => {
      const view = trackEventMock.mock.calls.find(
        ([payload]) => payload.eventName === "page_view",
      );
      expect(view?.[0]?.properties?.route).toBe("/");
    });

    first.unmount();
    window.history.replaceState({}, "", "/entrar?tab=entrar");
    usePathnameMock.mockReturnValue("/entrar");
    useSearchParamsMock.mockReturnValue(new URLSearchParams("tab=entrar"));

    render(
      <Template>
        <div>login</div>
      </Template>,
    );

    await waitFor(() => {
      const leave = trackEventMock.mock.calls.find(
        ([payload]) => payload.eventName === "page_leave",
      )?.[0];

      expect(leave?.properties?.route).toBe("/");
      expect(leave?.properties?.url).toBe(
        `${window.location.origin}/?utm_source=linkedin`,
      );
      expect(leave?.properties?.search).toBe("?utm_source=linkedin");
      expect(leave?.properties?.next_route).toBe("/entrar");
      expect(leave?.properties?.next_url).toBe(
        `${window.location.origin}/entrar?tab=entrar`,
      );
      expect(leave?.properties?.next_search).toBe("?tab=entrar");
      expect(leave?.properties?.leave_reason).toBe("route_change");
      expect(leave?.properties?.route).not.toBe("/entrar");
    });
  });

  it("resolves journey_current_route_visit_id/journey_previous_route in sessionStorage before any child useEffect reads them — same routeVisitId as page_view, no second generation", async () => {
    // Regression test for the radar_view/job_detail_viewed race: trackers
    // rendered inside Template read these sessionStorage keys in their own
    // useEffect on mount. Because React commits all layout effects (parent
    // and child) before any passive effect across the whole tree,
    // JourneyTrackerProvider must resolve/write them in a layout effect —
    // otherwise a child's passive effect can fire first and read stale
    // values from the previous route.
    const readsFromChildEffect: Array<{
      routeVisitId: string | null;
      previousRoute: string | null;
    }> = [];

    function ChildTracker() {
      useEffect(() => {
        readsFromChildEffect.push({
          routeVisitId: sessionStorage.getItem(
            "journey_current_route_visit_id",
          ),
          previousRoute: sessionStorage.getItem("journey_previous_route"),
        });
      }, []);

      return null;
    }

    usePathnameMock.mockReturnValue("/");
    const first = render(
      <Template>
        <div>home</div>
      </Template>,
    );

    await waitFor(() => {
      expect(
        trackEventMock.mock.calls.some(
          ([payload]) => payload.eventName === "page_view",
        ),
      ).toBe(true);
    });

    first.unmount();
    usePathnameMock.mockReturnValue("/radar");

    render(
      <Template>
        <ChildTracker />
      </Template>,
    );

    await waitFor(() => {
      expect(
        trackEventMock.mock.calls.some(
          ([payload]) =>
            payload.eventName === "page_view" &&
            payload.properties?.route === "/radar",
        ),
      ).toBe(true);
    });

    const pageViewForRadar = trackEventMock.mock.calls.find(
      ([payload]) =>
        payload.eventName === "page_view" &&
        payload.properties?.route === "/radar",
    )?.[0];

    expect(readsFromChildEffect).toHaveLength(1);
    expect(readsFromChildEffect[0]?.previousRoute).toBe("/");
    expect(readsFromChildEffect[0]?.routeVisitId).not.toBeNull();
    expect(readsFromChildEffect[0]?.routeVisitId).toBe(
      pageViewForRadar?.properties?.routeVisitId,
    );
  });
});
