"use client";

import { useEffect } from "react";

import { trackSeoPageViewed } from "@/lib/seo-pages/tracking";

export function SeoPageViewTracker({
  pageType,
  path,
  slug,
}: {
  pageType: "hub" | "profession" | "transactional";
  path: string;
  slug: string;
}) {
  useEffect(() => {
    void trackSeoPageViewed({ pageType, path, slug });
  }, [pageType, path, slug]);

  return null;
}
