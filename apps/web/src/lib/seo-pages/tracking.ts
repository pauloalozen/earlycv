import { emitBusinessFunnelEvent } from "@/lib/cv-adaptation-api";

type CtaLocation = "bottom" | "hero" | "middle";

export function trackSeoPageViewed(input: {
  pageType: "hub" | "profession" | "transactional";
  path: string;
  slug: string;
}) {
  try {
    return emitBusinessFunnelEvent({
      eventName: "seo_page_viewed",
      metadata: {
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
    return emitBusinessFunnelEvent({
      eventName: "seo_page_cta_clicked",
      metadata: {
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
