import { trackEvent } from "@/lib/analytics-tracking";

type BlogCtaLocation = "top" | "middle" | "bottom" | "index";

export function trackBlogIndexViewed() {
  return trackEvent({
    eventName: "blog_index_viewed",
    properties: {
      page: "/blog",
      source: "blog",
    },
  });
}

export function trackBlogPostViewed(input: {
  category: string;
  slug: string;
  tags: string[];
  title: string;
}) {
  return trackEvent({
    eventName: "blog_post_viewed",
    properties: {
      ...input,
      source: "blog",
    },
  });
}

export function trackBlogCtaClicked(location: BlogCtaLocation, slug?: string) {
  return trackEvent({
    eventName: "blog_cta_clicked",
    properties: {
      location,
      slug,
      source: "blog",
      target: "/adaptar",
    },
  });
}
