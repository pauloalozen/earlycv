// A pagina raiz de qualquer board Gupy (https://{subdomain}.gupy.io/, o
// mesmo dominio usado por GupyAdapter pra listar vagas) renderiza um
// <img alt="Logotipo {Empresa}" src="https://attachments.gupy.io/..."> no
// HTML ja servido pelo servidor (Next.js SSR/SSG) — nao precisa parsear o
// blob __NEXT_DATA__ como o fallback de GupyAdapter, uma busca direta no
// HTML basta. Confirmado via inspecao manual em cacaushow.gupy.io e
// genteraizen.gupy.io.
const IMG_TAG_REGEX = /<img\b[^>]*>/gi;
const ALT_LOGOTIPO_REGEX = /\balt="Logotipo[^"]*"/i;
const SRC_ATTR_REGEX = /\bsrc="([^"]+)"/i;

function getSubdomainFromSourceUrl(sourceUrl: string) {
  const parsed = new URL(sourceUrl);
  const match = parsed.hostname.toLowerCase().match(/^([a-z0-9-]+)\.gupy\.io$/);
  if (!match?.[1]) {
    throw new Error("gupy sourceUrl must point to {subdomain}.gupy.io");
  }
  return match[1];
}

export async function fetchGupyCompanyLogo(
  sourceUrl: string,
): Promise<string | null> {
  const subdomain = getSubdomainFromSourceUrl(sourceUrl);
  const careerPageUrl = `https://${subdomain}.gupy.io/`;

  const response = await fetch(careerPageUrl, {
    headers: { "User-Agent": "EarlyCV-Crawler/1.0" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const imgTags = html.match(IMG_TAG_REGEX) ?? [];

  for (const tag of imgTags) {
    if (!ALT_LOGOTIPO_REGEX.test(tag)) continue;
    const srcMatch = tag.match(SRC_ATTR_REGEX);
    if (srcMatch?.[1]) return srcMatch[1];
  }

  return null;
}
