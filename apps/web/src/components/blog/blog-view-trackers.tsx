"use client";

import { useEffect } from "react";

import { trackBlogIndexViewed, trackBlogPostViewed } from "@/lib/blog/tracking";

export function BlogIndexViewTracker() {
  useEffect(() => {
    void trackBlogIndexViewed();
  }, []);

  return null;
}

export function BlogPostViewTracker({
  category,
  slug,
  tags,
  title,
}: {
  category: string;
  slug: string;
  tags: string[];
  title: string;
}) {
  useEffect(() => {
    void trackBlogPostViewed({ category, slug, tags, title });
  }, [category, slug, tags, title]);

  return null;
}
