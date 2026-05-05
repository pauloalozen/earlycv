import { trackEvent } from "@/lib/analytics-tracking";

type BlogCtaLocation = "top" | "middle" | "bottom" | "index";
const BLOG_EVENT_DEDUP_KEY = "blog_tracked_events";

function shouldSkipDuplicatedBlogEvent(eventKey: string) {
  if (typeof sessionStorage === "undefined") {
    return false;
  }

  const raw = sessionStorage.getItem(BLOG_EVENT_DEDUP_KEY);
  const existing = (() => {
    if (!raw) {
      return {} as Record<string, true>;
    }

    try {
      return JSON.parse(raw) as Record<string, true>;
    } catch {
      return {} as Record<string, true>;
    }
  })();

  if (existing[eventKey]) {
    return true;
  }

  existing[eventKey] = true;
  sessionStorage.setItem(BLOG_EVENT_DEDUP_KEY, JSON.stringify(existing));
  return false;
}

function getCurrentRouteVisitId() {
  if (typeof sessionStorage === "undefined") {
    return "unknown-route-visit";
  }

  return (
    sessionStorage.getItem("journey_current_route_visit_id") ??
    "unknown-route-visit"
  );
}

async function waitForConsistentJourneyContext(expectedPathname: string) {
  const maxAttempts = 8;
  const waitMs = 25;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const pathname =
      typeof window !== "undefined" ? window.location.pathname : "";
    const routeVisitId = getCurrentRouteVisitId();

    if (
      pathname === expectedPathname &&
      routeVisitId.startsWith(`${expectedPathname}::`)
    ) {
      return routeVisitId;
    }

    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  return null;
}

export async function trackBlogIndexViewed() {
  const routeVisitId = await waitForConsistentJourneyContext("/blog");
  if (!routeVisitId) {
    return;
  }

  const dedupKey = `blog_index_viewed:${routeVisitId}`;
  if (shouldSkipDuplicatedBlogEvent(dedupKey)) {
    return;
  }

  return trackEvent({
    eventName: "blog_index_viewed",
    properties: {
      content_source: "blog",
      page: "/blog",
    },
  });
}

export async function trackBlogPostViewed(input: {
  category: string;
  slug: string;
  tags: string[];
  title: string;
}) {
  const expectedPathname = `/blog/${input.slug}`;
  const routeVisitId = await waitForConsistentJourneyContext(expectedPathname);
  if (!routeVisitId) {
    return;
  }

  const dedupKey = `blog_post_viewed:${input.slug}:${routeVisitId}`;
  if (shouldSkipDuplicatedBlogEvent(dedupKey)) {
    return;
  }

  return trackEvent({
    eventName: "blog_post_viewed",
    properties: {
      ...input,
      content_source: "blog",
    },
  });
}

export function trackBlogCtaClicked(input: {
  category?: string;
  cta_id?: string;
  cta_label?: string;
  cta_location: BlogCtaLocation;
  cta_text?: string;
  href?: string;
  slug?: string;
  target_url?: string;
  title?: string;
}) {
  return trackEvent({
    eventName: "blog_cta_clicked",
    properties: {
      category: input.category,
      content_source: "blog",
      cta_id: input.cta_id,
      cta_label: input.cta_label,
      cta_location: input.cta_location,
      cta_text: input.cta_text,
      href: input.href,
      location: input.cta_location,
      slug: input.slug,
      target: input.target_url ?? "/adaptar",
      target_url: input.target_url ?? "/adaptar",
      title: input.title,
    },
  });
}
