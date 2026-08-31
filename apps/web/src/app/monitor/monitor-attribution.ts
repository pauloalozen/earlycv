// Sinaliza "chegou no Monitor a partir do digest por e-mail" — persistido
// na sessão (não só no clique que trouxe o usuário aqui) porque o funil
// que a Fase 3 quer medir cobre vários eventos ao longo da mesma sessão
// (monitor_digest_clicked -> monitor_view -> monitor_recommendation_clicked
// -> monitor_application_started), não só o primeiro. Reaproveita o
// mecanismo de UTM já existente (getAnalyticsBaseProperties já anexa
// utm_source em todo trackEvent — ver analytics-tracking.ts); este módulo
// só resolve o valor de product_origin correspondente, sem duplicar
// nenhuma lógica de persistência de UTM nova.
const MONITOR_EMAIL_ORIGIN_KEY = "monitor_email_origin_session";

export function captureMonitorEmailOriginFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("utm_source") === "monitor_email") {
      sessionStorage.setItem(MONITOR_EMAIL_ORIGIN_KEY, "1");
    }
  } catch {
    // sessionStorage indisponível (modo privado, etc.) — sem persistência,
    // getMonitorProductOrigin cai no default "monitor" pro resto da sessão.
  }
}

export function getMonitorProductOrigin(): "monitor" | "monitor_email" {
  if (typeof window === "undefined") return "monitor";
  try {
    return sessionStorage.getItem(MONITOR_EMAIL_ORIGIN_KEY) === "1"
      ? "monitor_email"
      : "monitor";
  } catch {
    return "monitor";
  }
}
