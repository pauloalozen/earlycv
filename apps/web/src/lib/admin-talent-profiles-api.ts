import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type TalentIdentityConfidence =
  | "CONFIRMED_USER"
  | "STRONG_MATCH"
  | "UNVERIFIED";

export type TalentSeniority =
  | "INTERN"
  | "JUNIOR"
  | "MID"
  | "SENIOR"
  | "LEAD"
  | "STAFF"
  | "MANAGER"
  | "DIRECTOR"
  | "UNKNOWN";

export type TalentJobArea =
  | "DATA_AI"
  | "SOFTWARE_ENGINEERING"
  | "CLOUD_DEVOPS"
  | "CYBERSECURITY"
  | "PRODUCT"
  | "DESIGN_UX"
  | "QA_TEST"
  | "PROJECT_AGILE"
  | "ARCHITECTURE"
  | "LEADERSHIP"
  | "GROWTH_MARKETING"
  | "BUSINESS_ANALYTICS"
  | "CX_DIGITAL"
  | "IT_SUPPORT"
  | "ERP_FUNCTIONAL"
  | "OTHER";

export type TalentProfileRecord = {
  id: string;
  userId: string | null;
  hasCvSource: boolean;
  identityConfidence: TalentIdentityConfidence;
  fullName: string | null;
  primaryEmail: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  currentTitle: string | null;
  seniority: TalentSeniority | null;
  yearsExperience: number | null;
  primaryAreas: TalentJobArea[];
  technologies: string[];
  languages: { language: string; proficiencyLevel: string | null }[];
  lastAnalysisAt: string | null;
  lastInteractionAt: string | null;
  lastEnrichedAt: string | null;
};

export type SearchTalentProfilesFilters = {
  page?: number;
  pageSize?: number;
  query?: string;
  technology?: string;
  language?: string;
  minYearsExperience?: number;
  maxYearsExperience?: number;
  seniority?: TalentSeniority;
  primaryArea?: TalentJobArea;
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

async function apiRequest<T>(path: string, token?: string) {
  const bearerToken = await resolveToken(token);

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${bearerToken}` },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export async function searchTalentProfiles(
  filters: SearchTalentProfilesFilters = {},
  token?: string,
) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  if (filters.query) params.set("query", filters.query);
  if (filters.technology) params.set("technology", filters.technology);
  if (filters.language) params.set("language", filters.language);
  if (filters.minYearsExperience !== undefined) {
    params.set("minYearsExperience", String(filters.minYearsExperience));
  }
  if (filters.maxYearsExperience !== undefined) {
    params.set("maxYearsExperience", String(filters.maxYearsExperience));
  }
  if (filters.seniority) params.set("seniority", filters.seniority);
  if (filters.primaryArea) params.set("primaryArea", filters.primaryArea);
  const qs = params.toString();

  return apiRequest<{
    page: number;
    pageSize: number;
    total: number;
    technologySuggestions: string[];
    languageSuggestions: string[];
    profiles: TalentProfileRecord[];
  }>(`/admin/talent-profiles${qs ? `?${qs}` : ""}`, token);
}

export async function getTalentProfileCvUrl(id: string, token?: string) {
  return apiRequest<{ url: string | null }>(
    `/admin/talent-profiles/${id}/cv-url`,
    token,
  );
}
