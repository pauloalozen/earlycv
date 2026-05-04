import { trackEvent } from "@/lib/analytics-tracking";

type CtaLocation = "bottom" | "hero" | "middle";

export function trackSeoPageViewed(input: {
  pageType: "hub" | "profession" | "transactional";
  path: string;
  slug: string;
}) {
  try {
    return trackEvent({
      eventName: "seo_page_viewed",
      properties: {
        page_type: input.pageType,
        path: input.path,
        slug: input.slug,
        source: "seo_page",
      },
    }).catch(() => undefined);
  } catch {
    return Promise.resolve();
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
        location: input.location,
        page_type: input.pageType,
        path: input.path,
        slug: input.slug,
        source: "seo_page",
        target: input.target,
      },
    }).catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}
