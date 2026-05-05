import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const trackBlogIndexViewedMock = vi.hoisted(() => vi.fn());
const trackBlogPostViewedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/blog/tracking", () => ({
  trackBlogIndexViewed: trackBlogIndexViewedMock,
  trackBlogPostViewed: trackBlogPostViewedMock,
}));

import {
  BlogIndexViewTracker,
  BlogPostViewTracker,
} from "./blog-view-trackers";

describe("blog view trackers", () => {
  beforeEach(() => {
    trackBlogIndexViewedMock.mockReset();
    trackBlogIndexViewedMock.mockResolvedValue(undefined);
    trackBlogPostViewedMock.mockReset();
    trackBlogPostViewedMock.mockResolvedValue(undefined);
  });

  it("invokes blog_index tracker on mount", async () => {
    render(
      <StrictMode>
        <BlogIndexViewTracker />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(trackBlogIndexViewedMock).toHaveBeenCalled();
    });
  });

  it("tracks blog_post_viewed with provided post data", async () => {
    render(
      <BlogPostViewTracker
        category="Curriculo"
        slug="curriculo-ats"
        tags={["ats"]}
        title="Curriculo ATS"
      />,
    );

    await waitFor(() => {
      expect(trackBlogPostViewedMock).toHaveBeenCalledWith({
        category: "Curriculo",
        slug: "curriculo-ats",
        tags: ["ats"],
        title: "Curriculo ATS",
      });
    });
  });
});
