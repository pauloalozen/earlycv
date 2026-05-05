import { describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
}));

import { trackSeoPageCtaClicked, trackSeoPageViewed } from "./tracking";

describe("seo pages tracking", () => {
  it("emits seo_page_viewed payload", async () => {
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
});
