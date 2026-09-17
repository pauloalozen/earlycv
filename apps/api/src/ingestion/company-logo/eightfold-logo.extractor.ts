// Mesmos dois modos do EightfoldAdapter (ver eightfold.adapter.ts) — a
// pagina de logo muda de forma junto com o modo:
//
// - "direto" (*.eightfold.ai, ex: Vale, Eaton): {origin}/careers tem o
//   logo em um de dois formatos, dependendo do tema do tenant — testado
//   manualmente:
//   1) tema novo (Vale): config JSON embutida na pagina com
//      "navBar": {"image": "https://static.vscdn.net/images/careers/..."}.
//   2) tema antigo (Eaton): <img alt="eightfold-logo" src="...">.
//   Tenta os dois, nessa ordem.
// - "proxy" (dominio proprio, ex: Mercado Livre): cada empresa tem seu
//   proprio frontend, sem padrao Eightfold nenhum — so da pra tentar um
//   heuristico generico (apple-touch-icon, depois og:image), testado so
//   contra Mercado Livre. Cobertura parcial por natureza, mesma tolerancia
//   documentada nos outros extractors (ver logo-extractors.ts).
const NAV_BAR_IMAGE_REGEX = /"navBar"\s*:\s*\{[^}]*?"image"\s*:\s*"([^"]+)"/i;
const IMG_TAG_REGEX = /<img\b[^>]*>/gi;
const EIGHTFOLD_LOGO_ALT_REGEX = /\balt="eightfold-logo"/i;
const SRC_ATTR_REGEX = /\bsrc="([^"]+)"/i;
const APPLE_TOUCH_ICON_REGEX =
  /<link\b[^>]*rel="apple-touch-icon"[^>]*href="([^"]+)"/i;
const OG_IMAGE_REGEX = /<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"/i;

// A WAF (Cloudflare) do Mercado Livre bloqueia com 403 qualquer User-Agent
// contendo "Crawler" — mesmo achado do EightfoldAdapter, mesma UA aqui.
const EIGHTFOLD_USER_AGENT = "Mozilla/5.0 (compatible; EarlyCVBot/1.0)";

function isDirectEightfoldHost(hostname: string) {
  return hostname.toLowerCase().endsWith(".eightfold.ai");
}

function resolveUrl(candidate: string, origin: string): string {
  try {
    return new URL(candidate, origin).toString();
  } catch {
    return candidate;
  }
}

export async function fetchEightfoldCompanyLogo(
  sourceUrl: string,
): Promise<string | null> {
  const parsed = new URL(sourceUrl);
  const origin = parsed.origin;
  const pageUrl = isDirectEightfoldHost(parsed.hostname)
    ? `${origin}/careers`
    : origin;

  const response = await fetch(pageUrl, {
    headers: { "User-Agent": EIGHTFOLD_USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();

  if (isDirectEightfoldHost(parsed.hostname)) {
    // O tema novo (Vale) embute a config como atributo HTML — as aspas do
    // JSON chegam HTML-entity-encoded (&#34; em vez de "), por isso decodifica
    // antes de casar o regex.
    const navBarMatch = html.replace(/&#34;/g, '"').match(NAV_BAR_IMAGE_REGEX);
    if (navBarMatch?.[1]) return resolveUrl(navBarMatch[1], origin);

    const imgTags = html.match(IMG_TAG_REGEX) ?? [];
    for (const tag of imgTags) {
      if (!EIGHTFOLD_LOGO_ALT_REGEX.test(tag)) continue;
      const srcMatch = tag.match(SRC_ATTR_REGEX);
      if (srcMatch?.[1]) return resolveUrl(srcMatch[1], origin);
    }

    return null;
  }

  const appleTouchIconMatch = html.match(APPLE_TOUCH_ICON_REGEX);
  if (appleTouchIconMatch?.[1]) {
    return resolveUrl(appleTouchIconMatch[1], origin);
  }

  const ogImageMatch = html.match(OG_IMAGE_REGEX);
  if (ogImageMatch?.[1]) return resolveUrl(ogImageMatch[1], origin);

  return null;
}
