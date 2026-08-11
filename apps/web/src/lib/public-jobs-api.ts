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

export type MatchDetailItem = { label: string; ok: boolean };

export type MatchBreakdownDetails = {
  area: MatchDetailItem[];
  skills: MatchDetailItem[];
  seniority: MatchDetailItem[];
  technologies: MatchDetailItem[];
};

export type ExistingApplication = {
  id: string;
  status: string;
  bestScore: number | null;
} | null;

export type PublicJob = {
  canonicalKey: string;
  city: string | null;
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
  state: string | null;
  status: string;
  technologies: string[];
  title: string;
  workModel: string | null;
  score?: number | null;
  breakdown?: MatchBreakdown | null;
  breakdownDetails?: MatchBreakdownDetails | null;
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
  area?: string;
  seniority?: string;
  state?: string;
  city?: string;
};

export type FacetItem = { value: string; count: number };

// state (sigla, ex: "SP") difere de label (nome por extenso, ex: "São
// Paulo") — geo-normalizer.ts resolve as duas grafias sujas ("SP"/"São
// Paulo"/"SAO PAULO") num único facet. value é o que vai na URL/filtro,
// label é o que aparece no dropdown.
export type StateFacetItem = { value: string; label: string; count: number };

export type PublicJobFacets = {
  workModels: FacetItem[];
  areas: FacetItem[];
  seniorities: FacetItem[];
  companies: FacetItem[];
  states: StateFacetItem[];
  cities: FacetItem[];
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
  if (filters?.area) params.set("area", filters.area);
  if (filters?.seniority) params.set("seniority", filters.seniority);
  if (filters?.state) params.set("state", filters.state);
  if (filters?.city) params.set("city", filters.city);

  const qs = params.toString();
  return requestPublicJobs<PublicJobsPage>(`/public/jobs${qs ? `?${qs}` : ""}`);
}

export async function getPublicJobBySlug(slug: string) {
  return requestPublicJobs<PublicJob>(`/public/jobs/${slug}`);
}

export async function getPublicJobFacets(filters?: {
  state?: string;
}): Promise<PublicJobFacets> {
  const params = new URLSearchParams();
  if (filters?.state) params.set("state", filters.state);
  const qs = params.toString();
  return requestPublicJobs<PublicJobFacets>(
    `/public/jobs/facets${qs ? `?${qs}` : ""}`,
  );
}
