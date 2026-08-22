// Mesmas chaves usadas em analytics-tracking.ts / journey-tracker-provider.tsx
// — não duplicar o literal, importar daqui em código novo.
export const JOURNEY_SESSION_STORAGE_KEY = "journey_session_internal_id";
export const JOURNEY_ROUTE_VISIT_STORAGE_KEY = "journey_current_route_visit_id";
export const JOURNEY_PREVIOUS_ROUTE_STORAGE_KEY = "journey_previous_route";

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
