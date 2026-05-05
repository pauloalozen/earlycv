import { beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
}));

import { trackSeoPageCtaClicked, trackSeoPageViewed } from "./tracking";

describe("seo pages tracking", () => {
  beforeEach(() => {
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    sessionStorage.clear();
  });

  it("emits seo_page_viewed payload", async () => {
    window.history.replaceState({}, "", "/palavras-chave-curriculo");
    sessionStorage.setItem(
      "journey_current_route_visit_id",
      "/palavras-chave-curriculo::visit-1",
    );

    await trackSeoPageViewed({
      pageType: "hub",
      path: "/palavras-chave-curriculo",
      slug: "palavras-chave-curriculo",
    });

    expect(trackEventMock).toHaveBeenCalledWith({
      eventName: "seo_page_viewed",
      properties: {
        content_source: "seo_page",
        page_type: "hub",
        path: "/palavras-chave-curriculo",
        slug: "palavras-chave-curriculo",
      },
    });
  });

  it("emits seo_page_cta_clicked payload", async () => {
    await trackSeoPageCtaClicked({
      location: "hero",
      pageType: "hub",
      path: "/palavras-chave-curriculo",
      slug: "palavras-chave-curriculo",
      target: "/adaptar",
    });

    expect(trackEventMock).toHaveBeenCalledWith({
      eventName: "seo_page_cta_clicked",
      properties: {
        content_source: "seo_page",
        location: "hero",
        page_type: "hub",
        path: "/palavras-chave-curriculo",
        slug: "palavras-chave-curriculo",
        target: "/adaptar",
      },
    });
  });

  it("waits for matching routeVisitId before seo_page_viewed", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/curriculo-ats");
    sessionStorage.setItem("journey_current_route_visit_id", "/::old");

    const pending = trackSeoPageViewed({
      pageType: "transactional",
      path: "/curriculo-ats",
      slug: "curriculo-ats",
    });

    vi.advanceTimersByTime(50);
    expect(trackEventMock).not.toHaveBeenCalled();

    sessionStorage.setItem(
      "journey_current_route_visit_id",
      "/curriculo-ats::visit-2",
    );
    vi.advanceTimersByTime(50);
    await pending;

    expect(trackEventMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("dedupes concurrent seo_page_viewed calls for same route context", async () => {
    window.history.replaceState({}, "", "/curriculo-ats");
    sessionStorage.setItem(
      "journey_current_route_visit_id",
      "/curriculo-ats::visit-3",
    );

    await Promise.all([
      trackSeoPageViewed({
        pageType: "transactional",
        path: "/curriculo-ats",
        slug: "curriculo-ats",
      }),
      trackSeoPageViewed({
        pageType: "transactional",
        path: "/curriculo-ats",
        slug: "curriculo-ats",
      }),
    ]);

    expect(trackEventMock).toHaveBeenCalledTimes(1);
  });
});
