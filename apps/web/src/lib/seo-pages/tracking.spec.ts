import { describe, expect, it, vi } from "vitest";

const emitBusinessFunnelEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cv-adaptation-api", () => ({
  emitBusinessFunnelEvent: emitBusinessFunnelEventMock,
}));

import { trackSeoPageCtaClicked, trackSeoPageViewed } from "./tracking";

describe("seo pages tracking", () => {
  it("emits seo_page_viewed payload", async () => {
    await trackSeoPageViewed({
      pageType: "hub",
      path: "/palavras-chave-curriculo",
      slug: "palavras-chave-curriculo",
    });

    expect(emitBusinessFunnelEventMock).toHaveBeenCalledWith({
      eventName: "seo_page_viewed",
      metadata: {
        page_type: "hub",
        path: "/palavras-chave-curriculo",
        slug: "palavras-chave-curriculo",
        source: "seo_page",
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

    expect(emitBusinessFunnelEventMock).toHaveBeenCalledWith({
      eventName: "seo_page_cta_clicked",
      metadata: {
        location: "hero",
        page_type: "hub",
        path: "/palavras-chave-curriculo",
        slug: "palavras-chave-curriculo",
        source: "seo_page",
        target: "/adaptar",
      },
    });
  });
});
