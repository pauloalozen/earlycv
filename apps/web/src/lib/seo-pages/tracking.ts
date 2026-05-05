import { trackEvent } from "@/lib/analytics-tracking";

type CtaLocation = "bottom" | "hero" | "middle";
const SEO_VIEW_DEDUP_KEY = "seo_page_viewed_dedup";
const seoViewInFlight = new Set<string>();

function shouldSkipDuplicatedSeoView(eventKey: string) {
  if (typeof sessionStorage === "undefined") {
    return false;
  }

  const raw = sessionStorage.getItem(SEO_VIEW_DEDUP_KEY);
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
  sessionStorage.setItem(SEO_VIEW_DEDUP_KEY, JSON.stringify(existing));
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

export async function trackSeoPageViewed(input: {
  pageType: "hub" | "profession" | "transactional";
  path: string;
  slug: string;
}) {
  const routeVisitId = await waitForConsistentJourneyContext(input.path);
  if (!routeVisitId) {
    return;
  }

  const eventKey = `${input.path}:${routeVisitId}`;
  if (seoViewInFlight.has(eventKey) || shouldSkipDuplicatedSeoView(eventKey)) {
    return;
  }

  seoViewInFlight.add(eventKey);

  try {
    await trackEvent({
      eventName: "seo_page_viewed",
      properties: {
        content_source: "seo_page",
        page_type: input.pageType,
        path: input.path,
        slug: input.slug,
      },
    }).catch(() => undefined);
  } catch {
    return;
  } finally {
    seoViewInFlight.delete(eventKey);
  }
}

export function trackSeoPageCtaClicked(input: {
  location: CtaLocation;
  pageType: "hub" | "profession" | "transactional";
  path: string;
  slug: string;
  target: string;
}) {
  try {
    return trackEvent({
      eventName: "seo_page_cta_clicked",
      properties: {
        content_source: "seo_page",
        location: input.location,
        page_type: input.pageType,
        path: input.path,
        slug: input.slug,
        target: input.target,
      },
    }).catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}
