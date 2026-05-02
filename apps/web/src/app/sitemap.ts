import type { MetadataRoute } from "next";

import { getBlogSitemapEntries } from "@/lib/blog/posts";
import { jobs } from "@/lib/jobs";
import { getAbsoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: getAbsoluteUrl("/"),
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: getAbsoluteUrl("/blog"),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: getAbsoluteUrl("/privacidade"),
      lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: getAbsoluteUrl("/termos-de-uso"),
      lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    ...jobs.map((job) => ({
      url: getAbsoluteUrl(`/vagas/${job.slug}`),
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    ...getBlogSitemapEntries().map((entry) => ({
      url: getAbsoluteUrl(`/blog/${entry.slug}`),
      lastModified: entry.lastModified,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    })),
  ];
}
