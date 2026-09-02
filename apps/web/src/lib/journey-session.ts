// Mesmas chaves usadas em analytics-tracking.ts / journey-tracker-provider.tsx
// — não duplicar o literal, importar daqui em código novo.
export const JOURNEY_SESSION_STORAGE_KEY = "journey_session_internal_id";
export const JOURNEY_ROUTE_VISIT_STORAGE_KEY = "journey_current_route_visit_id";
export const JOURNEY_PREVIOUS_ROUTE_STORAGE_KEY = "journey_previous_route";
export const JOB_NAVIGATION_CONTEXT_STORAGE_KEY = "job_navigation_context";

// Origens que podem escrever este marcador antes de navegar pra
// /radar/[slug] — RadarOpportunityLink grava "radar", o card de
// recomendação do Alerta (monitor-recommendation-card.tsx) grava
// "monitor"/"monitor_email" (via getMonitorProductOrigin(), que já
// resolve e-mail vs. dentro do app a partir do UTM do digest).
export type JobNavigationOrigin = "radar" | "monitor" | "monitor_email";

// Marcador de origem escrito no clique (síncrono, antes da navegação) e
// lido por múltiplos consumidores no destino — JobDetailViewTracker (pro
// job_detail_viewed) e o botão de salvar vaga (pra decidir origin do
// SavedJob) precisam do MESMO valor resolvido, então a leitura é um peek
// (nunca remove), não um consume-once — a proteção contra reaproveitamento
// por uma navegação futura não relacionada é só o TTL curto + o próprio
// jobId no marcador. Evita depender de journey_previous_route, que é
// escrito pelo JourneyTrackerProvider de forma assíncrona e sujeito à
// ordem de effects filho-antes-do-pai (ver docs/runbook/events.md).
const JOB_NAVIGATION_CONTEXT_TTL_MS = 30_000;

type JobNavigationContext = {
  jobId: string;
  origin: JobNavigationOrigin;
  createdAt: number;
};

export function getJourneySessionInternalId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(JOURNEY_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getJourneyRouteVisitId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(JOURNEY_ROUTE_VISIT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getJourneyPreviousRoute(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(JOURNEY_PREVIOUS_ROUTE_STORAGE_KEY);
  } catch {
    return null;
  }
}

// product_origin determinístico por prefixo exato de previous_route —
// nunca por heurística de hostname/referrer (essas viram só pathname antes
// de chegar aqui, ver sanitizeReferrer em analytics-tracking.ts):
//   - previous_route começa com "/radar" -> "radar"
//   - previous_route começa com "/alerta-vaga-certa" -> "monitor" (fallback
//     raro — o marcador de clique de monitor-recommendation-card.tsx já
//     cobre o caso comum)
//   - sem previous_route (1º pageview da sessão) -> "seo_job" (entrada
//     direta numa vaga específica sem navegação prévia é o padrão de
//     tráfego orgânico)
//   - qualquer outro previous_route interno -> "direct"
function resolveFallbackProductOrigin(
  previousRoute: string | null,
): JobNavigationOrigin | "seo_job" | "direct" {
  if (previousRoute?.startsWith("/radar")) return "radar";
  if (previousRoute?.startsWith("/alerta-vaga-certa")) return "monitor";
  if (!previousRoute) return "seo_job";
  return "direct";
}

// Único ponto de resolução de origem de uma página de vaga — usado tanto
// por JobDetailViewTracker (pro evento job_detail_viewed) quanto pelo
// botão de salvar vaga (pra decidir SavedJob.origin), pra garantir que os
// dois concordem sobre a mesma navegação sem duplicar a lógica de
// fallback. `readJobNavigationContext` é um peek (não remove), então
// chamar isto mais de uma vez na mesma página sempre devolve o mesmo
// valor dentro do TTL.
export function resolveJobProductOrigin(
  jobId: string,
): JobNavigationOrigin | "seo_job" | "direct" {
  const clickOrigin = readJobNavigationContext(jobId);
  return clickOrigin ?? resolveFallbackProductOrigin(getJourneyPreviousRoute());
}

export function writeJobNavigationContext(
  jobId: string,
  origin: JobNavigationOrigin,
): void {
  if (typeof window === "undefined") return;
  try {
    const marker: JobNavigationContext = {
      jobId,
      origin,
      createdAt: Date.now(),
    };
    sessionStorage.setItem(
      JOB_NAVIGATION_CONTEXT_STORAGE_KEY,
      JSON.stringify(marker),
    );
  } catch {
    // sessionStorage indisponível (modo privado, etc.) — sem marcador,
    // JobDetailViewTracker cai no fallback de previousRoute.
  }
}

const VALID_ORIGINS: readonly JobNavigationOrigin[] = [
  "radar",
  "monitor",
  "monitor_email",
];

// Lê (sem remover — peek) o marcador de clique. Retorna a origem só
// quando o marcador existe, pertence ao mesmo jobId e ainda está dentro
// do TTL — caso contrário null, para o caller cair no fallback baseado em
// previousRoute.
export function readJobNavigationContext(
  jobId: string,
): JobNavigationOrigin | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(JOB_NAVIGATION_CONTEXT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<JobNavigationContext>;
    if (
      typeof parsed.jobId !== "string" ||
      typeof parsed.origin !== "string" ||
      !VALID_ORIGINS.includes(parsed.origin as JobNavigationOrigin) ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }

    if (parsed.jobId !== jobId) return null;
    if (Date.now() - parsed.createdAt > JOB_NAVIGATION_CONTEXT_TTL_MS) {
      return null;
    }

    return parsed.origin as JobNavigationOrigin;
  } catch {
    return null;
  }
}
