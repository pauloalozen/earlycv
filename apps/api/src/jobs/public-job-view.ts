type PublicJobInput = {
  canonicalKey: string;
  company: { name: string };
  country: string | null;
  descriptionClean: string;
  employmentType: string | null;
  firstSeenAt: Date;
  id: string;
  lastSeenAt: Date;
  locationText: string;
  publishedAtSource: Date | null;
  descriptionRaw: string;
  sourceJobUrl: string;
  status: string;
  title: string;
  workModel: string | null;
};

export type PublicJobView = {
  canonicalKey: string;
  company: string;
  country: string | null;
  description: string;
  employmentType: string | null;
  firstSeenAt: string;
  id: string;
  lastSeenAt: string;
  location: string;
  publishedAtSource: string | null;
  slug: string;
  descriptionHtml: string;
  sourceJobUrl: string;
  status: string;
  title: string;
  workModel: string | null;
};

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildPublicJobSlug(id: string, title: string, company: string) {
  const safeId = id.replace(/[^a-zA-Z0-9-]/g, "-");
  return `${slugify(title)}-${slugify(company)}-${safeId}`;
}

export function toPublicJobView(job: PublicJobInput): PublicJobView {
  return {
    canonicalKey: job.canonicalKey,
    company: job.company.name,
    country: job.country,
    description: job.descriptionClean,
    descriptionHtml: job.descriptionRaw,
    employmentType: job.employmentType,
    firstSeenAt: job.firstSeenAt.toISOString(),
    id: job.id,
    lastSeenAt: job.lastSeenAt.toISOString(),
    location: job.locationText,
    publishedAtSource: job.publishedAtSource?.toISOString() ?? null,
    slug: buildPublicJobSlug(job.id, job.title, job.company.name),
    sourceJobUrl: job.sourceJobUrl,
    status: job.status,
    title: job.title,
    workModel: job.workModel,
  };
}
