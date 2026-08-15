// A página pública de qualquer board Teamtailor (https://{subdomain}.
// teamtailor.com/jobs, mesmo domínio usado por TeamtailorAdapter) sempre
// renderiza o logo em um <img> hospedado no CDN oficial, sob o caminho
// "logotype-v3" — mesmo quando a empresa usa um domínio próprio (a
// Teamtailor deixa customizar o domínio, mas não o template): confirmado
// manualmente que "{subdomain}.teamtailor.com/jobs" redireciona pro
// domínio customizado (ex: jobs.ripio.com, carreiras.obramax.com.br) e a
// mesma tag continua lá. fetch() já segue redirect por padrão, então não
// precisa tratar isso explicitamente. Diferente do og:image (que aqui é
// só o banner retangular de compartilhamento, 1200x630) — o <img> do CDN é
// o logo quadrado de verdade.
const IMG_TAG_REGEX = /<img\b[^>]*>/gi;
const SRC_ATTR_REGEX = /\bsrc="([^"]+)"/i;
const LOGO_PATH_MARKER = "teamtailor-cdn.com";
const LOGO_TYPE_MARKER = "logotype-v3";

function extractSlug(sourceUrl: string): string {
  const parsed = new URL(sourceUrl);
  const match = parsed.hostname
    .toLowerCase()
    .match(/^([a-z0-9-]+)\.teamtailor\.com$/);
  if (!match?.[1]) {
    throw new Error(
      `Invalid Teamtailor sourceUrl: ${sourceUrl} (expected {subdomain}.teamtailor.com)`,
    );
  }
  return match[1];
}

export async function fetchTeamtailorCompanyLogo(
  sourceUrl: string,
): Promise<string | null> {
  const slug = extractSlug(sourceUrl);
  const careerPageUrl = `https://${slug}.teamtailor.com/jobs`;

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
    const src = srcMatch?.[1];
    if (src?.includes(LOGO_PATH_MARKER) && src.includes(LOGO_TYPE_MARKER)) {
      return src;
    }
  }

  return null;
}
