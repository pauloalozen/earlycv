// Sem "import server-only" de propósito: este módulo só é usado por
// sitemap.ts (rota nativa do Next, nunca bundlada pro client), e o guard
// quebraria os testes de sitemap.ts que rodam via node:test puro (sem o
// shim de "server-only" que o vitest.config.ts injeta pra outros specs).

export type SitemapJob = {
  slug: string;
  lastSeenAt: string;
};

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return base.endsWith("/api") ? base : `${base}/api`;
}

// Endpoint sem auth (dado já público em /vagas) — usado só pelo sitemap.ts,
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
