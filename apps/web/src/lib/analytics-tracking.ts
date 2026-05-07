import { getFrontendAnalyticsContext } from "@/lib/analytics-context";
import { emitBusinessFunnelEvent } from "@/lib/cv-adaptation-api";
import {
  getPosthogSessionId,
  waitForPosthogSessionId,
} from "@/lib/posthog-session";

const UTM_STORAGE_KEY = "analytics_first_touch_utm";
const BUSINESS_FUNNEL_EVENTS_PATH =
  "/api/analysis-observability/business-funnel-events";
const JOURNEY_SESSION_KEY = "journey_session_internal_id";
const JOURNEY_ROUTE_VISIT_KEY = "journey_current_route_visit_id";
const JOURNEY_PREVIOUS_ROUTE_KEY = "journey_previous_route";

function isPosthogSessionRequired() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  return typeof key === "string" && key.length > 0;
}

type UtmParams = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

type AuthAnalyticsContext = {
  authStatus?: "loading" | "anonymous" | "authenticated";
  isAuthenticated: boolean;
  userId: string | null;
};

const AUTH_ANALYTICS_STORAGE_KEY = "analytics_auth_context";

function getAuthAnalyticsContext(): AuthAnalyticsContext {
  if (typeof window === "undefined") {
    return { isAuthenticated: false, userId: null };
  }

  const raw = window.sessionStorage.getItem(AUTH_ANALYTICS_STORAGE_KEY);
  if (!raw) {
    return { isAuthenticated: false, userId: null };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthAnalyticsContext>;
    const userId = typeof parsed.userId === "string" ? parsed.userId : null;
    return {
      isAuthenticated: Boolean(parsed.isAuthenticated && userId),
      userId,
    };
  } catch {
    return { isAuthenticated: false, userId: null };
  }
}

function buildSessionInternalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `journey-${Date.now()}`;
}

function getJourneyContext() {
  if (typeof window === "undefined") {
    return {
      previousRoute: null,
      routeVisitId: null,
      sessionInternalId: null,
    };
  }

  const storage = window.sessionStorage;
  if (!storage) {
    return {
      previousRoute: null,
      routeVisitId: null,
      sessionInternalId: null,
    };
  }

  const existingSessionInternalId = storage.getItem(JOURNEY_SESSION_KEY);
  const sessionInternalId =
    existingSessionInternalId && existingSessionInternalId.trim().length > 0
      ? existingSessionInternalId
      : buildSessionInternalId();

  if (!existingSessionInternalId) {
    storage.setItem(JOURNEY_SESSION_KEY, sessionInternalId);
  }

  const existingRouteVisitId = storage.getItem(JOURNEY_ROUTE_VISIT_KEY);
  const routeVisitId =
    existingRouteVisitId && existingRouteVisitId.trim().length > 0
      ? existingRouteVisitId
      : `${window.location.pathname}::${Date.now()}::manual`;

  if (!existingRouteVisitId) {
    storage.setItem(JOURNEY_ROUTE_VISIT_KEY, routeVisitId);
  }

  const previousRoute = storage.getItem(JOURNEY_PREVIOUS_ROUTE_KEY);

  return {
    previousRoute,
    routeVisitId,
    sessionInternalId,
  };
}

async function ensurePosthogSessionIdForEvent(
  _eventName: string,
): Promise<string | null> {
  const available = getPosthogSessionId();
  if (available) {
    return available;
  }

  if (!isPosthogSessionRequired()) {
    return null;
  }

  return waitForPosthogSessionId();
}

type TrackEventInput = {
  eventName: string;
  eventVersion?: number;
  idempotencyKey?: string;
  properties?: Record<string, unknown>;
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function readWindowUtmParams(): UtmParams {
  if (typeof window === "undefined") {
    return {};
  }

  const searchParams = new URLSearchParams(window.location.search);
  const fromUrl = {
    utm_source: searchParams.get("utm_source") ?? undefined,
    utm_medium: searchParams.get("utm_medium") ?? undefined,
    utm_campaign: searchParams.get("utm_campaign") ?? undefined,
    utm_content: searchParams.get("utm_content") ?? undefined,
    utm_term: searchParams.get("utm_term") ?? undefined,
  } satisfies UtmParams;

  return Object.fromEntries(
    Object.entries(fromUrl).filter(([, value]) => Boolean(value?.trim())),
  ) as UtmParams;
}

export function captureAndPersistUtmParams(): UtmParams {
  if (typeof window === "undefined") {
    return {};
  }

  const storage = window.localStorage;
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function"
  ) {
    return readWindowUtmParams();
  }

  const currentUrlUtm = readWindowUtmParams();
  const hasCurrentUtm = Object.keys(currentUrlUtm).length > 0;
  if (!hasCurrentUtm) {
    return getPersistedUtmParams();
  }

  const existing = getPersistedUtmParams();
  const hasExisting = Object.keys(existing).length > 0;
  if (hasExisting) {
    return existing;
  }

  storage.setItem(UTM_STORAGE_KEY, JSON.stringify(currentUrlUtm));
  return currentUrlUtm;
}

export function getPersistedUtmParams(): UtmParams {
  if (typeof window === "undefined") {
    return {};
  }

  const storage = window.localStorage;
  if (!storage || typeof storage.getItem !== "function") {
    return {};
  }

  const raw = storage.getItem(UTM_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as UtmParams;
    return {
      utm_source:
        typeof parsed.utm_source === "string" ? parsed.utm_source : undefined,
      utm_medium:
        typeof parsed.utm_medium === "string" ? parsed.utm_medium : undefined,
      utm_campaign:
        typeof parsed.utm_campaign === "string"
          ? parsed.utm_campaign
          : undefined,
      utm_content:
        typeof parsed.utm_content === "string" ? parsed.utm_content : undefined,
      utm_term:
        typeof parsed.utm_term === "string" ? parsed.utm_term : undefined,
    };
  } catch {
    return {};
  }
}

export function getAnalyticsBaseProperties(): Record<string, unknown> {
  const analyticsContext = getFrontendAnalyticsContext();
  const utm = captureAndPersistUtmParams();

  const route = typeof window !== "undefined" ? window.location.pathname : null;
  const url = typeof window !== "undefined" ? window.location.href : null;
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : null;
  const search = typeof window !== "undefined" ? window.location.search : null;
  const referrer = typeof document !== "undefined" ? document.referrer : null;
  const authContext = getAuthAnalyticsContext();
  const journeyContext = getJourneyContext();

  return {
    route,
    url,
    pathname,
    search,
    referrer,
    previous_route: journeyContext.previousRoute,
    routeVisitId: journeyContext.routeVisitId,
    sessionInternalId: journeyContext.sessionInternalId,
    ...(getPosthogSessionId() ? { $session_id: getPosthogSessionId() } : {}),
    isAuthenticated: authContext.isAuthenticated,
    userId: authContext.userId,
    user_id: authContext.userId,
    source: "frontend",
    ...analyticsContext,
    ...utm,
  };
}

function emitGa4Event(eventName: string, properties: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof window.gtag !== "function") {
    return;
  }

  const pageLocation =
    typeof window !== "undefined" ? window.location.href : "";
  const pagePath =
    typeof window !== "undefined" ? window.location.pathname : undefined;
  const pageReferrer =
    typeof document !== "undefined" ? document.referrer : undefined;

  window.gtag("event", eventName, {
    utm_source: properties.utm_source,
    utm_medium: properties.utm_medium,
    utm_campaign: properties.utm_campaign,
    utm_content: properties.utm_content,
    utm_term: properties.utm_term,
    page_location: pageLocation,
    page_path: pagePath,
    page_referrer: pageReferrer,
  });
}

async function postBusinessFunnelEvent(payload: {
  eventName: string;
  eventVersion: number;
  idempotencyKey?: string;
  metadata: Record<string, unknown>;
  posthogSessionId?: string | null;
}): Promise<void> {
  if (typeof window === "undefined") {
    await emitBusinessFunnelEvent(payload);
    return;
  }

  const response = await fetch(BUSINESS_FUNNEL_EVENTS_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(payload.posthogSessionId
        ? { "x-posthog-session-id": payload.posthogSessionId }
        : {}),
    },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  if (!response.ok && process.env.NODE_ENV !== "production") {
    const body = await response.text().catch(() => "");
    console.debug(
      "[analytics] failed to emit business funnel event",
      response.status,
      body,
    );
  }
}

export async function trackEvent(input: TrackEventInput): Promise<void> {
  const resolvedPosthogSessionId = await ensurePosthogSessionIdForEvent(
    input.eventName,
  );
  const baseProperties = getAnalyticsBaseProperties();
  const metadata: Record<string, unknown> = {
    ...baseProperties,
    event_version: input.eventVersion ?? 1,
    ...input.properties,
  };

  if (resolvedPosthogSessionId) {
    metadata.$session_id = resolvedPosthogSessionId;
  }

  metadata.source = "frontend";

  const authContext = getAuthAnalyticsContext();
  if (authContext.userId) {
    metadata.userId = authContext.userId;
    metadata.user_id = authContext.userId;
    metadata.isAuthenticated = true;
  }

  await postBusinessFunnelEvent({
    eventName: input.eventName,
    eventVersion: input.eventVersion ?? 1,
    idempotencyKey: input.idempotencyKey,
    metadata,
    posthogSessionId: resolvedPosthogSessionId,
  });

  emitGa4Event(input.eventName, metadata);
}
