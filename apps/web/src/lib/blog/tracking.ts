import { emitBusinessFunnelEvent } from "@/lib/cv-adaptation-api";

type BlogCtaLocation = "top" | "middle" | "bottom" | "index";

export function trackBlogIndexViewed() {
  return emitBusinessFunnelEvent({
    eventName: "blog_index_viewed",
    metadata: {
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
  return emitBusinessFunnelEvent({
    eventName: "blog_post_viewed",
    metadata: {
      ...input,
      source: "blog",
    },
  });
}

export function trackBlogCtaClicked(location: BlogCtaLocation, slug?: string) {
  return emitBusinessFunnelEvent({
    eventName: "blog_cta_clicked",
    metadata: {
      location,
      slug,
      source: "blog",
      target: "/adaptar",
    },
  });
}
