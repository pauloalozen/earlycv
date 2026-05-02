"use client";

import { useEffect } from "react";

import { trackSeoPageViewed } from "@/lib/seo-pages/tracking";

export function SeoPageViewTracker({
  path,
  slug,
}: {
  path: string;
  slug: string;
}) {
  useEffect(() => {
    void trackSeoPageViewed({ path, slug });
  }, [path, slug]);

  return null;
}
