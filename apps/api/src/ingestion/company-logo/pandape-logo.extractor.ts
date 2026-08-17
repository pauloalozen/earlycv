// A pagina raiz de qualquer board Pandape ({slug}.pandape.com.br, mesmo
// dominio usado por PandapeAdapter) renderiza o logo da empresa em
// <img class="img-fluid brand-image" src="..."> dentro do header, quando a
// empresa usa o template padrao (nao customizado) — confirmado em
// CSU Digital, Grupo GR e Empregga. Empresas com microsite "whitelabel"
// pago (ex: Tenda Atacado) trocam esse template inteiro por um proprio,
// sem a classe "brand-image" — nesses casos a extracao retorna null, mesmo
// padrao de cobertura parcial de greenhouse/ashby (ver comentario em
// logo-extractors.ts).
const IMG_TAG_REGEX = /<img\b[^>]*>/gi;
const BRAND_IMAGE_CLASS_REGEX = /\bclass="[^"]*\bbrand-image\b[^"]*"/i;
const SRC_ATTR_REGEX = /\bsrc="([^"]+)"/i;

function getOrigin(sourceUrl: string) {
  try {
    return new URL(sourceUrl).origin;
  } catch {
    throw new Error(`Invalid Pandape sourceUrl: ${sourceUrl}`);
  }
}

export async function fetchPandapeCompanyLogo(
  sourceUrl: string,
): Promise<string | null> {
  const origin = getOrigin(sourceUrl);

  const response = await fetch(`${origin}/`, {
    headers: { "User-Agent": "EarlyCV-Crawler/1.0" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const imgTags = html.match(IMG_TAG_REGEX) ?? [];

  for (const tag of imgTags) {
    if (!BRAND_IMAGE_CLASS_REGEX.test(tag)) continue;
    const srcMatch = tag.match(SRC_ATTR_REGEX);
    if (srcMatch?.[1]) return srcMatch[1];
  }

  return null;
}
