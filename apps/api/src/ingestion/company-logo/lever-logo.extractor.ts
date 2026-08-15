// A página pública de qualquer board Lever (https://jobs.lever.co/{slug},
// mesmo domínio usado por LeverAdapter) é servida no HTML já pronto (sem
// SPA client-render) e sempre tem 2 <img>: o logo da empresa (hospedado em
// lever-client-logos.s3.us-west-2.amazonaws.com) e o logo do próprio Lever
// no rodapé (src relativo "/img/lever-logo-refresh.svg"). Filtrar pelo
// domínio do bucket S3 é mais robusto que tentar casar o alt (que muda por
// empresa) — confirmado manualmente em despegar, neon, trela, ciandt (4/4
// fontes reais testadas, todas com o mesmo padrão).
const IMG_TAG_REGEX = /<img\b[^>]*>/gi;
const SRC_ATTR_REGEX = /\bsrc="([^"]+)"/i;
const COMPANY_LOGO_HOST = "lever-client-logos.s3.us-west-2.amazonaws.com";

function extractSlug(sourceUrl: string): string {
  const match =
    sourceUrl.match(/postings\/([^/?]+)/) ??
    sourceUrl.match(/lever\.co\/([^/?]+)/);
  if (!match?.[1]) {
    throw new Error(
      `Invalid Lever sourceUrl: ${sourceUrl} (expected .../postings/{slug})`,
    );
  }
  return match[1];
}

export async function fetchLeverCompanyLogo(
  sourceUrl: string,
): Promise<string | null> {
  const slug = extractSlug(sourceUrl);
  const careerPageUrl = `https://jobs.lever.co/${slug}`;

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
    const srcMatch = tag.match(SRC_ATTR_REGEX);
    if (srcMatch?.[1]?.includes(COMPANY_LOGO_HOST)) {
      return srcMatch[1];
    }
  }

  return null;
}
