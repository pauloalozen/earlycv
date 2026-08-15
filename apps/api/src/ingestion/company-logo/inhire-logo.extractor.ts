// A página de vagas de qualquer tenant InHire (https://{slug}.inhire.app/vagas,
// mesmo domínio usado por InHireAdapter via extractSlug) é uma SPA — o HTML
// servido pelo backend não contém a <img> do logo (só aparece depois do
// React montar). O sinal que já vem pronto no HTML server-rendered é a meta
// tag `og:image`, que aponta pro banner/preview específico da empresa (ex:
// "https://files.inhire.app/og-images/cielo.png" para cielo.inhire.app —
// confirmado manualmente; o domínio genérico carreiras.inhire.app, que não
// é tenant de cliente, devolve a imagem padrão da própria InHire).
const META_TAG_REGEX = /<meta\b[^>]*>/gi;
const OG_IMAGE_PROPERTY_REGEX = /\bproperty="og:image"/i;
const CONTENT_ATTR_REGEX = /\bcontent="([^"]+)"/i;

function getSlugFromSourceUrl(sourceUrl: string) {
  const parsed = new URL(sourceUrl);
  const match = parsed.hostname
    .toLowerCase()
    .match(/^([a-z0-9-]+)\.inhire\.app$/);
  if (!match?.[1]) {
    throw new Error("inhire sourceUrl must point to {slug}.inhire.app");
  }
  return match[1];
}

export async function fetchInHireCompanyLogo(
  sourceUrl: string,
): Promise<string | null> {
  const slug = getSlugFromSourceUrl(sourceUrl);
  const careerPageUrl = `https://${slug}.inhire.app/vagas`;

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
