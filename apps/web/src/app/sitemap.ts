import type { MetadataRoute } from "next";

import { getBlogSitemapEntries } from "@/lib/blog/posts";
import { getSitemapJobs } from "@/lib/internal-jobs-api";
import { isJobsGhostModeEnabled } from "@/lib/jobs-ghost-mode";
import { getSeoSitemapEntries } from "@/lib/seo-pages/pages";
import { getAbsoluteUrl } from "@/lib/site";

const PRIMARY_PAGES_LAST_MODIFIED = new Date("2026-05-02");
const LEGAL_PAGES_LAST_MODIFIED = new Date("2026-04-14");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Com ghost mode ligado, /radar e /radar/[slug] estão bloqueadas no
  // robots.txt e retornam notFound() pra quem não é admin — nunca submeter
  // essas URLs ao Google enquanto isso for verdade.
  const isGhostMode = isJobsGhostModeEnabled();
  const jobs = isGhostMode ? [] : await getSitemapJobs();

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
    ...(isGhostMode
      ? []
      : [
          {
            url: getAbsoluteUrl("/radar"),
            lastModified: new Date(),
            changeFrequency: "daily" as const,
            priority: 0.8,
          },
        ]),
    ...jobs.map((job) => ({
      url: getAbsoluteUrl(`/radar/${job.slug}`),
      lastModified: new Date(job.lastSeenAt),
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
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
