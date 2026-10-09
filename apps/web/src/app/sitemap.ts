import type { MetadataRoute } from "next";

import { getBlogSitemapEntries } from "@/lib/blog/posts";
import { getSitemapJobs } from "@/lib/internal-jobs-api";
import { isMockInterviewPublic } from "@/lib/mock-interview-mode";
import {
  getRadarLandingIndex,
  listEligibleLandings,
} from "@/lib/radar-landings";
import { getSeoSitemapEntries } from "@/lib/seo-pages/pages";
import { getAbsoluteUrl, isSelfCanonical } from "@/lib/site";

const PRIMARY_PAGES_LAST_MODIFIED = new Date("2026-05-02");
const LEGAL_PAGES_LAST_MODIFIED = new Date("2026-04-14");
const MOCK_INTERVIEW_PAGE_LAST_MODIFIED = new Date("2026-10-01");
// Páginas de produto indexáveis (entraram no sitemap em 2026-10-09).
const PRODUCT_PAGES_LAST_MODIFIED = new Date("2026-10-09");
const PRODUCT_PAGES = [
  "/analise-de-curriculo",
  "/carta-de-apresentacao",
  "/preparacao-para-entrevista",
  "/gestao-de-candidaturas",
  "/radar-de-vagas",
];

type SitemapEntry = MetadataRoute.Sitemap[number] & { canonical?: string };

// Gerado a cada leitura (as chamadas à API seguem em cache de 5 min). Como
// ISR, o sitemap ficava congelado no que a API devolveu durante o build na
// Vercel — a revalidação de 5 min não acontecia em produção, então vagas
// novas e landings só entravam no próximo deploy (e um build que rodasse
// antes do deploy da API saía sem as landings).
export const dynamic = "force-dynamic";

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

  const entries: SitemapEntry[] = [
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
    ...PRODUCT_PAGES.map((path) => ({
      url: getAbsoluteUrl(path),
      lastModified: PRODUCT_PAGES_LAST_MODIFIED,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
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
      canonical: entry.canonical,
    })),
    ...getSeoSitemapEntries().map((entry) => ({
      url: getAbsoluteUrl(entry.path),
      lastModified: entry.lastModified,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    })),
  ];

  return entries
    .filter((entry) => isSelfCanonical(entry.url, entry.canonical))
    .map(({ canonical: _canonical, ...entry }) => entry);
}
