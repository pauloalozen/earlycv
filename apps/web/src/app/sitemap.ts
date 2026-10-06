import type { MetadataRoute } from "next";

import { getBlogSitemapEntries } from "@/lib/blog/posts";
import { getSitemapJobs } from "@/lib/internal-jobs-api";
import { isMockInterviewPublic } from "@/lib/mock-interview-mode";
import {
  getRadarLandingIndex,
  listEligibleLandings,
} from "@/lib/radar-landings";
import { getSeoSitemapEntries } from "@/lib/seo-pages/pages";
import { getAbsoluteUrl } from "@/lib/site";

const PRIMARY_PAGES_LAST_MODIFIED = new Date("2026-05-02");
const LEGAL_PAGES_LAST_MODIFIED = new Date("2026-04-14");
const MOCK_INTERVIEW_PAGE_LAST_MODIFIED = new Date("2026-10-01");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [jobs, landingIndex] = await Promise.all([
    getSitemapJobs(),
    getRadarLandingIndex(),
  ]);
  // Páginas perenes do radar (área, empresa, tecnologia, cidade, remotas,
  // nível, estágio e combinações) — só as que têm volume para serem
  // indexáveis agora. Os números mudam todo dia, daí lastModified = agora.
  const landings = landingIndex ? listEligibleLandings(landingIndex) : [];
  const now = new Date();

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
    // Só entra no sitemap com a venda aberta ao público.
    ...(isMockInterviewPublic()
      ? [
          {
            url: getAbsoluteUrl("/simulacao-de-entrevista"),
            lastModified: MOCK_INTERVIEW_PAGE_LAST_MODIFIED,
            changeFrequency: "monthly" as const,
            priority: 0.8,
          },
        ]
      : []),
    {
      url: getAbsoluteUrl("/radar"),
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    },
    ...landings.map(({ landing }) => ({
      url: getAbsoluteUrl(landing.path),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...jobs.map((job) => ({
      url: getAbsoluteUrl(`/radar/${job.slug}`),
      lastModified: new Date(job.contentUpdatedAt ?? job.lastSeenAt),
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
