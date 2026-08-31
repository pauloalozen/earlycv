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

export function buildMonitorDigestLink(
  digestId: string,
  recommendationId?: string,
): string {
  const params = new URLSearchParams({
    utm_source: UTM_SOURCE,
    utm_medium: UTM_MEDIUM,
    utm_campaign: UTM_CAMPAIGN,
    utm_content: digestId,
    ...(recommendationId ? { rec: recommendationId } : {}),
  });
  return `${getFrontendBaseUrl()}/monitor?${params.toString()}`;
}

export function buildMonitorUnsubscribeLink(token: string): string {
  const apiBase = process.env.API_URL ?? "http://localhost:4000";
  return `${apiBase}/api/monitor/unsubscribe?token=${encodeURIComponent(token)}`;
}
