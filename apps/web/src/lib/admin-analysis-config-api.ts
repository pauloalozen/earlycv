import { getBackofficeSessionToken } from "./backoffice-session.server";

export type AnalysisConfigRiskLevel = "low" | "medium" | "high";
export type AnalysisConfigOrigin = "database" | "env" | "default";
export type AnalysisConfigType =
  | "boolean"
  | "int"
  | "duration_ms"
  | "percent"
  | "list"
  | "enum"
  | "unit";

export type AdminAnalysisConfigEntry = {
  defaultValue: unknown;
  impactDescription: string;
  key: string;
  max?: number;
  min?: number;
  origin: AnalysisConfigOrigin;
  risk: AnalysisConfigRiskLevel;
  type: AnalysisConfigType;
  value: unknown;
  values?: string[];
};

export type ListAnalysisConfigsResponse = {
  entries: AdminAnalysisConfigEntry[];
};

export type UpdateAnalysisConfigPayload = {
  source?: string;
  technicalContext?: Record<string, unknown>;
  value: unknown;
};

export type UpdateAnalysisConfigResponse = {
  entry: AdminAnalysisConfigEntry;
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

export async function listAnalysisProtectionConfigs(token?: string) {
  return apiRequest<ListAnalysisConfigsResponse>(
    "/admin/analysis-protection/config",
    token,
  );
}

export async function updateAnalysisProtectionConfig(
  key: string,
  payload: UpdateAnalysisConfigPayload,
  token?: string,
) {
  return apiRequest<UpdateAnalysisConfigResponse>(
    `/admin/analysis-protection/config/${key}`,
    token,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
  );
}
