import "server-only";

import { apiRequest } from "./api-request";

export type MatchBreakdown = {
  area: number;
  skills: number;
  seniority: number;
  technologies: number;
  language: number;
  workModel: number;
};

export type ExistingApplication = {
  id: string;
  status: string;
  bestScore: number | null;
} | null;

export type PublicJob = {
  canonicalKey: string;
  company: string;
  companyWebsiteUrl: string | null;
  country: string | null;
  description: string;
  descriptionHtml: string;
  employmentType: string | null;
  firstSeenAt: string;
  id: string;
  lastSeenAt: string;
  location: string;
  publishedAtSource: string | null;
  seniorityLevel: string | null;
  slug: string;
  sourceJobUrl: string;
  status: string;
  technologies: string[];
  title: string;
  workModel: string | null;
  score?: number | null;
  breakdown?: MatchBreakdown | null;
  matchedSkills?: string[];
  missingSkills?: string[];
  existingApplication?: ExistingApplication;
  isSaved?: boolean;
};

export type PublicJobsPage = {
  data: PublicJob[];
  total: number;
  page: number;
  limit: number;
  highCompatCount?: number;
};

export type PublicJobsFilters = {
  q?: string;
  workModel?: string;
  seniorityLevel?: string;
  companyName?: string;
  publishedWithin?: "24h" | "3d" | "7d";
  page?: number;
  limit?: number;
  minScore?: number;
  minSkillsPct?: number;
  sort?: "score_desc" | "score_asc" | "date_desc" | "date_asc";
  excludeAnalyzed?: boolean;
};

export type FacetItem = { value: string; count: number };

export type PublicJobFacets = {
  workModels: FacetItem[];
  seniorityLevels: FacetItem[];
  companies: FacetItem[];
};

async function requestPublicJobs<T>(path: string) {
  const response = await apiRequest("GET", path);

  if (!response.ok) {
    throw new Error(`Public jobs API ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function listPublicJobs(
  filters?: PublicJobsFilters,
): Promise<PublicJobsPage> {
  const params = new URLSearchParams();
  if (filters?.q) params.set("q", filters.q);
  if (filters?.workModel) params.set("workModel", filters.workModel);
  if (filters?.seniorityLevel)
    params.set("seniorityLevel", filters.seniorityLevel);
  if (filters?.companyName) params.set("companyName", filters.companyName);
  if (filters?.publishedWithin)
    params.set("publishedWithin", filters.publishedWithin);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  if (filters?.minScore) params.set("minScore", String(filters.minScore));
  if (filters?.minSkillsPct)
    params.set("minSkillsPct", String(filters.minSkillsPct));
  if (filters?.sort) params.set("sort", filters.sort);
  if (filters?.excludeAnalyzed) params.set("excludeAnalyzed", "true");

  const qs = params.toString();
  return requestPublicJobs<PublicJobsPage>(`/public/jobs${qs ? `?${qs}` : ""}`);
}

export async function getPublicJobBySlug(slug: string) {
  return requestPublicJobs<PublicJob>(`/public/jobs/${slug}`);
}

export async function getPublicJobFacets(): Promise<PublicJobFacets> {
  return requestPublicJobs<PublicJobFacets>("/public/jobs/facets");
}
