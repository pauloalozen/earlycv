// Cobertura parcial e conhecida: só empresas no template moderno do board
// hospedado nativo (job-boards.greenhouse.io/{slug}, sem redirect pra fora)
// têm um <img alt="{Empresa} Logo"> consistente (confirmado manualmente em
// Nubank, Stone, Anthropic, RD Station, Agibank, Hotmart, EBANX, Jusbrasil,
// Twilio, Pagar.me, Zup). Duas categorias ficam de fora, sem solução
// genérica possível:
// 1) empresas grandes que usam o Greenhouse só como API e redirecionam a
//    página pra um site 100% customizado (Figma, Stripe, Elastic, Datadog,
//    Braze, Brex, BTG Pactual, Waymo, Bitso, entre outras) — cada uma com
//    HTML próprio, sem padrão nenhum;
// 2) empresas ainda no template antigo do próprio Greenhouse (ex: Banco
//    PAN) — banner solto sem atributo alt estruturado e sem og:image
//    preenchido.
// Retornar null nesses casos é o comportamento esperado, não uma falha —
// mesma tolerância que o resto do sistema já tem pra "logo não encontrado".
const IMG_TAG_REGEX = /<img\b[^>]*>/gi;
const LOGO_ALT_REGEX = /\balt="[^"]*\bLogo"/i;
const SRC_ATTR_REGEX = /\bsrc="([^"]+)"/i;

// Mesma lógica de GreenhouseAdapter.extractSlug — aceita tanto a URL da API
// (boards-api.greenhouse.io/v1/boards/{slug}/jobs) quanto a página pública
// (job-boards.greenhouse.io/{slug} ou boards.greenhouse.io/{slug}).
function extractSlug(sourceUrl: string): string {
  const apiMatch = sourceUrl.match(/\/boards\/([^/]+)\/jobs/);
  if (apiMatch?.[1]) return apiMatch[1];

  const parsed = new URL(sourceUrl);
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "job-boards.greenhouse.io" ||
    hostname === "boards.greenhouse.io"
  ) {
    const [slug] = parsed.pathname.split("/").filter(Boolean);
    if (slug) return slug;
  }

  throw new Error(
    `Invalid Greenhouse sourceUrl: ${sourceUrl} (expected .../boards/{slug}/jobs or job-boards.greenhouse.io/{slug})`,
  );
}

export async function fetchGreenhouseCompanyLogo(
  sourceUrl: string,
): Promise<string | null> {
  const slug = extractSlug(sourceUrl);
  const careerPageUrl = `https://job-boards.greenhouse.io/${slug}`;

  const response = await fetch(careerPageUrl, {
    headers: { "User-Agent": "EarlyCV-Crawler/1.0" },
    signal: AbortSignal.timeout(10_000),
  });

  // Cobre tanto erro real quanto redirect pra site customizado (fetch
  // segue redirects por padrão; se o destino não for mais o job board do
  // Greenhouse, o HTML abaixo simplesmente não terá o padrão esperado).
  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const imgTags = html.match(IMG_TAG_REGEX) ?? [];

  for (const tag of imgTags) {
    if (!LOGO_ALT_REGEX.test(tag)) continue;
    const srcMatch = tag.match(SRC_ATTR_REGEX);
    if (srcMatch?.[1]) return srcMatch[1];
  }

  return null;
}
