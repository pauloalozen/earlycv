// A página pública de qualquer board Ashby (https://jobs.ashbyhq.com/{slug},
// mesmo domínio usado por AshbyAdapter) é uma SPA — sem <img> no HTML
// server-rendered, igual InHire. O sinal disponível é a meta tag
// `og:image`, só que aqui é opt-in: a empresa precisa ter configurado um
// "org theme" (social ou logo) no Ashby pra essa tag existir. Cobertura
// parcial confirmada manualmente em 17 fontes reais: ~65% tinham og:image
// (Nubank, Notion, OpenAI, Ramp, Sierra, Supabase, Temporal, Perplexity,
// Deel, Cohere, ElevenLabs), o resto (Vercel, Loom, Linear, Cursor,
// Rippling, Adept) não tinha — nesse caso retorna null, mesmo tratamento
// de "logo não encontrado" que o resto do sistema já tolera por empresa.
// (O apple-touch-icon do board é o MESMO hash pra todas as empresas — é o
// favicon genérico do Ashby, não um sinal útil, por isso não é usado aqui.)
const META_TAG_REGEX = /<meta\b[^>]*>/gi;
const OG_IMAGE_PROPERTY_REGEX = /\bproperty="og:image"/i;
const CONTENT_ATTR_REGEX = /\bcontent="([^"]+)"/i;

function extractSlug(sourceUrl: string): string {
  const apiMatch = sourceUrl.match(/\/job-board\/([^/?]+)/);
  if (apiMatch?.[1]) return apiMatch[1];

  const parsed = new URL(sourceUrl);
  if (parsed.hostname.toLowerCase() === "jobs.ashbyhq.com") {
    const [slug] = parsed.pathname.split("/").filter(Boolean);
    if (slug) return slug;
  }

  throw new Error(
    `Invalid Ashby sourceUrl: ${sourceUrl} (expected .../posting-api/job-board/{slug} or jobs.ashbyhq.com/{slug})`,
  );
}

export async function fetchAshbyCompanyLogo(
  sourceUrl: string,
): Promise<string | null> {
  const slug = extractSlug(sourceUrl);
  const careerPageUrl = `https://jobs.ashbyhq.com/${slug}`;

  const response = await fetch(careerPageUrl, {
    headers: { "User-Agent": "EarlyCV-Crawler/1.0" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const metaTags = html.match(META_TAG_REGEX) ?? [];

  for (const tag of metaTags) {
    if (!OG_IMAGE_PROPERTY_REGEX.test(tag)) continue;
    const contentMatch = tag.match(CONTENT_ATTR_REGEX);
    if (contentMatch?.[1]) return contentMatch[1];
  }

  return null;
}
