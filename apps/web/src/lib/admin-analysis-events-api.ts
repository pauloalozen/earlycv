import { getBackofficeSessionToken } from "./backoffice-session.server";

export type AdminAnalysisEventDomain = "protection" | "business";
export type AdminAnalysisEventsEmitMode = "single" | "group" | "all";

export type AdminAnalysisEventsCatalogEntry = {
  eventName: string;
  eventVersion: number;
};

export type AdminAnalysisEventsCatalogResponse = {
  business: AdminAnalysisEventsCatalogEntry[];
  protection: AdminAnalysisEventsCatalogEntry[];
};

type EmitAdminAnalysisEventsSinglePayload = {
  eventName: string;
  group?: never;
  mode: "single";
};

type EmitAdminAnalysisEventsGroupPayload = {
  eventName?: never;
  group: AdminAnalysisEventDomain;
  mode: "group";
};

type EmitAdminAnalysisEventsAllPayload = {
  eventName?: never;
  group?: never;
  mode: "all";
};

export type EmitAdminAnalysisEventsPayload =
  | EmitAdminAnalysisEventsSinglePayload
  | EmitAdminAnalysisEventsGroupPayload
  | EmitAdminAnalysisEventsAllPayload;

export type EmitAdminAnalysisEventsResult = {
  domain: AdminAnalysisEventDomain;
  error?: string;
  eventName: string;
  status: "sent" | "failed";
};

export type EmitAdminAnalysisEventsResponse = {
  failed: number;
  requested: number;
  results: EmitAdminAnalysisEventsResult[];
  sent: number;
};

function getApiBaseUrl() {
  const configuredBaseUrl =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return configuredBaseUrl.endsWith("/api")
    ? configuredBaseUrl
    : `${configuredBaseUrl}/api`;
}

async function resolveToken(token?: string) {
  const sessionToken = token ?? (await getBackofficeSessionToken());

  if (!sessionToken) {
    throw new Error("Missing backoffice session token.");
  }

  return sessionToken;
}

async function apiRequest<T>(path: string, token?: string, init?: RequestInit) {
  const bearerToken = await resolveToken(token);
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export async function listAdminAnalysisEventsCatalog(token?: string) {
  return apiRequest<AdminAnalysisEventsCatalogResponse>(
    "/admin/analysis-observability/events/catalog",
    token,
  );
}

export async function emitAdminAnalysisEvents(
  payload: EmitAdminAnalysisEventsPayload,
  token?: string,
) {
  return apiRequest<EmitAdminAnalysisEventsResponse>(
    "/admin/analysis-observability/events/emit",
    token,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
}
