// Diferente dos outros extractors, aqui nem precisa buscar/parsear HTML: a
// URL do logo é previsível — toda career site Workday ({sourceUrl}, ex:
// https://mastercard.wd1.myworkdayjobs.com/CorporateCareers) serve o logo
// oficial em "{sourceUrl}/assets/logo" (é literalmente o que a própria
// página referencia via <meta property="og:image">). Confirmado
// manualmente em Mastercard, Dell, HP, Visa e Santander (com prefixo de
// locale no path, ex: .../pt-BR/SantanderCareers/assets/logo) — tamanhos
// de arquivo diferentes por empresa, não é um fallback compartilhado. Um
// HEAD basta pra confirmar existência antes de devolver a URL; o download +
// checagem de dimensão de verdade acontece em CompanyLogoFetchService.
function assertWorkdayHost(sourceUrl: string): URL {
  const parsed = new URL(sourceUrl);
  const isWorkdayHost = /^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/i.test(
    parsed.hostname,
  );
  if (!isWorkdayHost) {
    throw new Error(
      `Invalid Workday sourceUrl: ${sourceUrl} (expected {tenant}.{instance}.myworkdayjobs.com/{site})`,
    );
  }
  return parsed;
}

export async function fetchWorkdayCompanyLogo(
  sourceUrl: string,
): Promise<string | null> {
  const parsed = assertWorkdayHost(sourceUrl);
  const basePath = parsed.pathname.replace(/\/+$/, "");
  const logoUrl = `${parsed.origin}${basePath}/assets/logo`;

  const response = await fetch(logoUrl, {
    method: "HEAD",
    headers: { "User-Agent": "EarlyCV-Crawler/1.0" },
    signal: AbortSignal.timeout(10_000),
  });

  return response.ok ? logoUrl : null;
}
