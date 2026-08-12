// Sem "import server-only" de propósito: este módulo só é usado por
// sitemap.ts (rota nativa do Next, nunca bundlada pro client), e o guard
// quebraria os testes de sitemap.ts que rodam via node:test puro (sem o
// shim de "server-only" que o vitest.config.ts injeta pra outros specs).

import type { PublicJob } from "./public-jobs-api";

export type SitemapJob = {
  slug: string;
  lastSeenAt: string;
  contentUpdatedAt: string | null;
};

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return base.endsWith("/api") ? base : `${base}/api`;
}

// Endpoint sem auth (dado já público em /radar) — usado só pelo sitemap.ts,
// que roda sem sessão de usuário. Nunca usar apiRequest() aqui: ele depende
// de cookies(), que não existe no contexto de geração do sitemap.
//
// Falha de rede/API fora do ar nunca pode derrubar a geração do sitemap
// inteiro (perderíamos /blog, as páginas de SEO, etc. também) — por isso o
// catch amplo, não só o !response.ok.
export async function getSitemapJobs(): Promise<SitemapJob[]> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/internal/jobs/sitemap-data`,
      { next: { revalidate: 300 } },
    );

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as SitemapJob[];
  } catch {
    return [];
  }
}

// Usado por /radar/empresa/[empresa]. companySlug é derivado do nome da
// empresa (toCompanySlug, ver company-slug.ts) — sem correspondência, a API
// devolve companyName: null e jobs: [], e a página decide o notFound().
// Endpoint sem auth, mesma justificativa de getSitemapJobs acima.
export async function getPublicJobsByCompanySlug(
  companySlug: string,
): Promise<{ companyName: string | null; jobs: PublicJob[] }> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/internal/jobs/by-company/${encodeURIComponent(companySlug)}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return { companyName: null, jobs: [] };
    }

    return (await response.json()) as {
      companyName: string | null;
      jobs: PublicJob[];
    };
  } catch {
    return { companyName: null, jobs: [] };
  }
}

// Usado por /radar/tecnologia/[tech]. `total` é o volume real de vagas
// ativas com essa tecnologia — abaixo de minCount a API já devolve
// jobs: [] (ver JobsService#listPublicJobsByTech), e a página decide o
// notFound() com base nesse total. Endpoint sem auth, mesma justificativa
// de getSitemapJobs acima.
export async function getPublicJobsByTech(
  tech: string,
  minCount?: number,
): Promise<{ total: number; jobs: PublicJob[] }> {
  try {
    const qs = minCount ? `?minCount=${minCount}` : "";
    const response = await fetch(
      `${getApiBaseUrl()}/internal/jobs/by-tech/${encodeURIComponent(tech)}${qs}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return { total: 0, jobs: [] };
    }

    return (await response.json()) as { total: number; jobs: PublicJob[] };
  } catch {
    return { total: 0, jobs: [] };
  }
}
