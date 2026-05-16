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
  slug: string;
  sourceJobUrl: string;
  status: string;
  title: string;
  workModel: string | null;
};

function getApiBaseUrl() {
  const configuredBaseUrl =
    process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

export function filterPublicJobs(jobs: PublicJob[], query?: string) {
  const normalizedQuery = query?.trim().toLowerCase();
  if (!normalizedQuery) return jobs;

  return jobs.filter((job) => {
    const haystacks = [job.title, job.company, job.location, job.description];
    return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}

export async function listPublicJobs() {
  return requestPublicJobs<PublicJob[]>("/public/jobs");
}

export async function getPublicJobBySlug(slug: string) {
  return requestPublicJobs<PublicJob>(`/public/jobs/${slug}`);
}
