// UTMs consistentes em todo link do digest — nunca PII (email, nome,
// userId bruto) na URL. digestId (cuid, opaco) é o único identificador,
// correlacionável só de posse do banco. recommendationId é opcional,
// incluído por item quando o link é de uma recomendação específica.
const UTM_SOURCE = "monitor_email";
const UTM_MEDIUM = "email";
const UTM_CAMPAIGN = "monitor_digest";

function getFrontendBaseUrl(): string {
  return process.env.FRONTEND_URL ?? "http://localhost:3000";
}

// Ícone já existente em apps/web/public (mesmo mark usado no favicon),
// servido no domínio do próprio front — evita depender de um asset
// separado só pra e-mail.
export function buildMonitorLogoUrl(): string {
  return `${getFrontendBaseUrl()}/favicon-192x192.png`;
}

// CTA "Ver minhas oportunidades" — única sem vaga específica, sempre vai
// pra listagem do Alerta.
export function buildMonitorDigestLink(digestId: string): string {
  const params = new URLSearchParams({
    utm_source: UTM_SOURCE,
    utm_medium: UTM_MEDIUM,
    utm_campaign: UTM_CAMPAIGN,
    utm_content: digestId,
  });
  return `${getFrontendBaseUrl()}/alerta-vaga-certa?${params.toString()}`;
}

// Link de cada recomendação individual no e-mail — antes ia pra
// /alerta-vaga-certa (a listagem inteira) com ?rec=<id> só como parâmetro
// decorativo, sem levar pra vaga nenhuma. Agora vai direto pra página da
// vaga (/radar/{slug}, mesma rota pública usada em qualquer outro lugar do
// site) — jobSlug pode ser null pra vaga antiga sem slug gerado; nesse
// caso cai no fallback da listagem em vez de gerar um link quebrado
// /radar/null.
export function buildMonitorJobLink(
  jobSlug: string | null,
  digestId: string,
  recommendationId: string,
): string {
  const params = new URLSearchParams({
    utm_source: UTM_SOURCE,
    utm_medium: UTM_MEDIUM,
    utm_campaign: UTM_CAMPAIGN,
    utm_content: digestId,
    rec: recommendationId,
  });
  if (!jobSlug) {
    return `${getFrontendBaseUrl()}/alerta-vaga-certa?${params.toString()}`;
  }
  return `${getFrontendBaseUrl()}/radar/${jobSlug}?${params.toString()}`;
}

export function buildMonitorUnsubscribeLink(token: string): string {
  const apiBase = process.env.API_URL ?? "http://localhost:4000";
  return `${apiBase}/api/monitor/unsubscribe?token=${encodeURIComponent(token)}`;
}
