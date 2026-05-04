import { getFrontendAnalyticsContext } from "@/lib/analytics-context";
import { emitBusinessFunnelEvent } from "@/lib/cv-adaptation-api";

const UTM_STORAGE_KEY = "analytics_first_touch_utm";
const BUSINESS_FUNNEL_EVENTS_PATH =
  "/api/analysis-observability/business-funnel-events";

type UtmParams = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

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
  const search = typeof window !== "undefined" ? window.location.search : null;
  const referrer = typeof document !== "undefined" ? document.referrer : null;

  return {
    route,
    url,
    search,
    referrer,
    source: "web",
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
}): Promise<void> {
  if (typeof window === "undefined") {
    await emitBusinessFunnelEvent(payload);
    return;
  }

  const response = await fetch(BUSINESS_FUNNEL_EVENTS_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
  const baseProperties = getAnalyticsBaseProperties();
  const metadata = {
    ...baseProperties,
    ...input.properties,
  };

  await postBusinessFunnelEvent({
    eventName: input.eventName,
    eventVersion: input.eventVersion ?? 1,
    idempotencyKey: input.idempotencyKey,
    metadata,
  });

  emitGa4Event(input.eventName, metadata);
}
