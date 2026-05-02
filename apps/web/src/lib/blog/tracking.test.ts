import { describe, expect, it, vi } from "vitest";

const emitBusinessFunnelEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cv-adaptation-api", () => ({
  emitBusinessFunnelEvent: emitBusinessFunnelEventMock,
}));

import {
  trackBlogCtaClicked,
  trackBlogIndexViewed,
  trackBlogPostViewed,
} from "./tracking";

describe("blog tracking", () => {
  it("emits blog_index_viewed", async () => {
    await trackBlogIndexViewed();
    expect(emitBusinessFunnelEventMock).toHaveBeenCalledWith({
      eventName: "blog_index_viewed",
      metadata: {
        page: "/blog",
        source: "blog",
      },
    });
  });

  it("emits blog_post_viewed", async () => {
    await trackBlogPostViewed({
      category: "Curriculo",
      slug: "curriculo-ats",
      tags: ["ats"],
      title: "Curriculo ATS",
    });

    expect(emitBusinessFunnelEventMock).toHaveBeenCalledWith({
      eventName: "blog_post_viewed",
      metadata: {
        category: "Curriculo",
        slug: "curriculo-ats",
        source: "blog",
        tags: ["ats"],
        title: "Curriculo ATS",
      },
    });
  });

  it("emits blog_cta_clicked", async () => {
    await trackBlogCtaClicked("bottom", "curriculo-ats");
    expect(emitBusinessFunnelEventMock).toHaveBeenCalledWith({
      eventName: "blog_cta_clicked",
      metadata: {
        location: "bottom",
        slug: "curriculo-ats",
        source: "blog",
        target: "/adaptar",
      },
    });
  });
});
