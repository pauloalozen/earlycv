import "server-only";

export type PublicJob = {
  canonicalKey: string;
  company: string;
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
  title: string;
  workModel: string | null;
};

export type PublicJobsPage = {
  data: PublicJob[];
  total: number;
  page: number;
  limit: number;
};

export type PublicJobsFilters = {
  q?: string;
  workModel?: string;
  seniorityLevel?: string;
  companyName?: string;
  publishedWithin?: "24h" | "3d" | "7d";
  page?: number;
  limit?: number;
};

export type FacetItem = { value: string; count: number };

export type PublicJobFacets = {
  workModels: FacetItem[];
  seniorityLevels: FacetItem[];
  companies: FacetItem[];
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

async function requestPublicJobs<T>(path: string) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    cache: "no-store",
  });

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

  const qs = params.toString();
  return requestPublicJobs<PublicJobsPage>(`/public/jobs${qs ? `?${qs}` : ""}`);
}

export async function getPublicJobBySlug(slug: string) {
  return requestPublicJobs<PublicJob>(`/public/jobs/${slug}`);
}

export async function getPublicJobFacets(): Promise<PublicJobFacets> {
  return requestPublicJobs<PublicJobFacets>("/public/jobs/facets");
}
