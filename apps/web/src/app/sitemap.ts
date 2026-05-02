import type { MetadataRoute } from "next";

import { getBlogSitemapEntries } from "@/lib/blog/posts";
import { getSeoSitemapEntries } from "@/lib/seo-pages/pages";
import { getAbsoluteUrl } from "@/lib/site";

const PRIMARY_PAGES_LAST_MODIFIED = new Date("2026-05-02");
const LEGAL_PAGES_LAST_MODIFIED = new Date("2026-04-14");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: getAbsoluteUrl("/"),
      lastModified: PRIMARY_PAGES_LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: getAbsoluteUrl("/blog"),
      lastModified: PRIMARY_PAGES_LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: getAbsoluteUrl("/adaptar"),
      lastModified: PRIMARY_PAGES_LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: getAbsoluteUrl("/privacidade"),
      lastModified: LEGAL_PAGES_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: getAbsoluteUrl("/termos-de-uso"),
      lastModified: LEGAL_PAGES_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    ...getBlogSitemapEntries().map((entry) => ({
      url: getAbsoluteUrl(`/blog/${entry.slug}`),
      lastModified: entry.lastModified,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    })),
    ...getSeoSitemapEntries().map((entry) => ({
      url: getAbsoluteUrl(entry.path),
      lastModified: entry.lastModified,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    })),
  ];
}
