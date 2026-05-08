import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());

import {
  trackBlogCtaClicked,
  trackBlogIndexViewed,
  trackBlogPostViewed,
} from "./tracking";

describe("blog tracking", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
    window.history.replaceState({}, "", "/blog");
  });

  function getLatestMetadata() {
    const [, options] = fetchMock.mock.calls.at(-1) ?? [];
    const payload = JSON.parse(String(options?.body ?? "{}"));
    return payload.metadata as Record<string, unknown>;
  }

  it("emits blog_index_viewed", async () => {
    sessionStorage.setItem("journey_session_internal_id", "session-blog");
    sessionStorage.setItem(
      "journey_current_route_visit_id",
      "/blog::visit-blog",
    );

    await trackBlogIndexViewed();
    const metadata = getLatestMetadata();

    expect(metadata).toMatchObject({
      content_source: "blog",
      page: "/blog",
      route: "/blog",
      pathname: "/blog",
      routeVisitId: "/blog::visit-blog",
      sessionInternalId: "session-blog",
      source: "frontend",
    });
  });

  it("emits blog_post_viewed", async () => {
    window.history.replaceState({}, "", "/blog/curriculo-ats");
    sessionStorage.setItem(
      "journey_current_route_visit_id",
      "/blog/curriculo-ats::visit-post",
    );

    await trackBlogPostViewed({
      category: "Curriculo",
      slug: "curriculo-ats",
      tags: ["ats"],
      title: "Curriculo ATS",
    });

    const metadata = getLatestMetadata();
    expect(metadata).toMatchObject({
      category: "Curriculo",
      content_source: "blog",
      slug: "curriculo-ats",
      source: "frontend",
      tags: ["ats"],
      title: "Curriculo ATS",
      routeVisitId: expect.any(String),
      sessionInternalId: expect.any(String),
    });
  });

  it("emits blog_cta_clicked", async () => {
    sessionStorage.setItem("journey_session_internal_id", "session-blog-cta");
    sessionStorage.setItem("journey_current_route_visit_id", "visit-blog-cta");
    sessionStorage.setItem("journey_previous_route", "/blog");

    await trackBlogCtaClicked({
      category: "Curriculo",
      cta_id: "blog_analysis_cta_adaptar",
      cta_label: "Adaptar meu CV",
      cta_location: "bottom",
      cta_text: "Adaptar meu CV →",
      href: "/adaptar",
      slug: "curriculo-ats",
      target_url: "/adaptar",
      title: "Curriculo ATS",
    });

    const metadata = getLatestMetadata();
    expect(metadata).toMatchObject({
      app: "earlycv",
      content_source: "blog",
      source: "frontend",
      env: expect.any(String),
      event_version: 1,
      route: "/blog",
      pathname: "/blog",
      url: `${window.location.origin}/blog`,
      search: "",
      referrer: "",
      previous_route: "/blog",
      sessionInternalId: "session-blog-cta",
      routeVisitId: "visit-blog-cta",
      isAuthenticated: false,
      userId: null,
      user_id: null,

      category: "Curriculo",
      cta_id: "blog_analysis_cta_adaptar",
      cta_label: "Adaptar meu CV",
      cta_location: "bottom",
      cta_text: "Adaptar meu CV →",
      href: "/adaptar",
      location: "bottom",
      slug: "curriculo-ats",
      target: "/adaptar",
      target_url: "/adaptar",
      title: "Curriculo ATS",
    });
  });

  it("adds auth context for authenticated blog events", async () => {
    window.history.replaceState({}, "", "/blog/analista-bi");
    sessionStorage.setItem(
      "journey_current_route_visit_id",
      "/blog/analista-bi::visit-post",
    );

    sessionStorage.setItem(
      "analytics_auth_context",
      JSON.stringify({ isAuthenticated: true, userId: "user-blog-1" }),
    );

    await trackBlogPostViewed({
      category: "Dados",
      slug: "analista-bi",
      tags: ["bi"],
      title: "Analista BI",
    });

    const metadata = getLatestMetadata();
    expect(metadata).toMatchObject({
      isAuthenticated: true,
      userId: "user-blog-1",
      user_id: "user-blog-1",
    });
  });

  it("does not duplicate blog_index_viewed for same routeVisitId", async () => {
    sessionStorage.setItem(
      "journey_current_route_visit_id",
      "/blog::visit-blog-once",
    );

    await trackBlogIndexViewed();
    await trackBlogIndexViewed();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits for /blog routeVisitId before emitting blog_index_viewed", async () => {
    vi.useFakeTimers();
    sessionStorage.setItem("journey_current_route_visit_id", "/::old");

    const pending = trackBlogIndexViewed();
    vi.advanceTimersByTime(50);
    expect(fetchMock).not.toHaveBeenCalled();

    sessionStorage.setItem("journey_current_route_visit_id", "/blog::new");
    vi.advanceTimersByTime(50);
    await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("waits for /blog/<slug> routeVisitId before emitting blog_post_viewed", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/blog/curriculo-ats");
    sessionStorage.setItem("journey_current_route_visit_id", "/blog::list");

    const pending = trackBlogPostViewed({
      category: "Curriculo",
      slug: "curriculo-ats",
      tags: ["ats"],
      title: "Curriculo ATS",
    });
    vi.advanceTimersByTime(50);
    expect(fetchMock).not.toHaveBeenCalled();

    sessionStorage.setItem(
      "journey_current_route_visit_id",
      "/blog/curriculo-ats::post",
    );
    vi.advanceTimersByTime(50);
    await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
