// Mesmas chaves usadas em analytics-tracking.ts / journey-tracker-provider.tsx
// — não duplicar o literal, importar daqui em código novo.
export const JOURNEY_SESSION_STORAGE_KEY = "journey_session_internal_id";
export const JOURNEY_ROUTE_VISIT_STORAGE_KEY = "journey_current_route_visit_id";
export const JOURNEY_PREVIOUS_ROUTE_STORAGE_KEY = "journey_previous_route";
export const RADAR_JOB_NAVIGATION_CONTEXT_STORAGE_KEY =
  "radar_job_navigation_context";

// Marcador de origem escrito por RadarOpportunityLink no clique (síncrono,
// antes da navegação) e consumido por JobDetailViewTracker no mount da
// página de destino — evita depender de journey_previous_route, que é
// escrito pelo JourneyTrackerProvider de forma assíncrona e sujeito à
// ordem de effects filho-antes-do-pai (ver docs/runbook/events.md).
// Escopado a um jobId específico e de uso único: sempre removido na
// primeira leitura, curto TTL, nunca reaproveitado por uma navegação
// futura não relacionada ao clique que o criou.
const RADAR_JOB_NAVIGATION_CONTEXT_TTL_MS = 30_000;

type RadarJobNavigationContext = {
  jobId: string;
  origin: "radar";
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

export function writeRadarJobNavigationContext(jobId: string): void {
  if (typeof window === "undefined") return;
  try {
    const marker: RadarJobNavigationContext = {
      jobId,
      origin: "radar",
      createdAt: Date.now(),
    };
    sessionStorage.setItem(
      RADAR_JOB_NAVIGATION_CONTEXT_STORAGE_KEY,
      JSON.stringify(marker),
    );
  } catch {
    // sessionStorage indisponível (modo privado, etc.) — sem marcador,
    // JobDetailViewTracker cai no fallback de previousRoute.
  }
}

// Consome (lê + sempre remove) o marcador de clique do Radar. Retorna
// "radar" só quando o marcador existe, pertence ao mesmo jobId e ainda
// está dentro do TTL — caso contrário null, para o caller cair no
// fallback baseado em previousRoute.
export function consumeRadarJobNavigationContext(
  jobId: string,
): "radar" | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(
      RADAR_JOB_NAVIGATION_CONTEXT_STORAGE_KEY,
    );
    if (!raw) return null;

    sessionStorage.removeItem(RADAR_JOB_NAVIGATION_CONTEXT_STORAGE_KEY);

    const parsed = JSON.parse(raw) as Partial<RadarJobNavigationContext>;
    if (
      typeof parsed.jobId !== "string" ||
      parsed.origin !== "radar" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }

    if (parsed.jobId !== jobId) return null;
    if (Date.now() - parsed.createdAt > RADAR_JOB_NAVIGATION_CONTEXT_TTL_MS) {
      return null;
    }

    return "radar";
  } catch {
    return null;
  }
}
