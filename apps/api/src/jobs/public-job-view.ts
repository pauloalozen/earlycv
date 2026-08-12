type PublicJobInput = {
  canonicalKey: string;
  city: string | null;
  company: { name: string; websiteUrl: string | null };
  country: string | null;
  descriptionClean: string;
  employmentType: string | null;
  enrichment: { technologies: string[]; dominantArea: string | null } | null;
  externalJobId: string | null;
  firstSeenAt: Date;
  id: string;
  lastSeenAt: Date;
  locationText: string;
  publishedAtSource: Date | null;
  descriptionRaw: string;
  seniorityLevel: string | null;
  slug: string | null;
  sourceJobUrl: string;
  state: string | null;
  status: string;
  title: string;
  workModel: string | null;
};

export type PublicJobView = {
  canonicalKey: string;
  city: string | null;
  company: string;
  companyWebsiteUrl: string | null;
  country: string | null;
  description: string;
  dominantArea: string | null;
  employmentType: string | null;
  externalJobId: string | null;
  firstSeenAt: string;
  id: string;
  lastSeenAt: string;
  location: string;
  publishedAtSource: string | null;
  seniorityLevel: string | null;
  slug: string;
  descriptionHtml: string;
  sourceJobUrl: string;
  state: string | null;
  status: string;
  technologies: string[];
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

// Usado por /internal/jobs/by-company/:companySlug (JobsService) pra casar
// o slug da URL com Company.name — não existe campo de slug persistido em
// Company, então o casamento é feito computando o slug de cada nome
// candidato e comparando. Mesma função de slugify que já gera o slug de
// vaga, só exposta com outro nome pra deixar claro o uso em company.
export function toCompanySlug(name: string): string {
  return slugify(name);
}

export function buildPublicJobSlug(id: string, title: string, company: string) {
  const safeId = id.replace(/[^a-zA-Z0-9-]/g, "-");
  return `${slugify(title)}-${slugify(company)}-${safeId}`;
}

export function toPublicJobView(job: PublicJobInput): PublicJobView {
  return {
    canonicalKey: job.canonicalKey,
    city: job.city,
    company: job.company.name,
    companyWebsiteUrl: job.company.websiteUrl,
    country: job.country,
    description: job.descriptionClean,
    descriptionHtml: job.descriptionRaw,
    dominantArea: job.enrichment?.dominantArea ?? null,
    employmentType: job.employmentType,
    externalJobId: job.externalJobId,
    firstSeenAt: job.firstSeenAt.toISOString(),
    id: job.id,
    lastSeenAt: job.lastSeenAt.toISOString(),
    location: job.locationText,
    publishedAtSource: job.publishedAtSource?.toISOString() ?? null,
    seniorityLevel: job.seniorityLevel,
    // Jobs sem slug (ainda não backfilled) nunca deveriam chegar aqui — as
    // queries públicas filtram slug != null. Fallback vazio só evita quebra
    // de tipo; se aparecer em produção é sinal de bug na query chamadora.
    slug: job.slug ?? "",
    sourceJobUrl: job.sourceJobUrl,
    state: job.state,
    status: job.status,
    technologies: job.enrichment?.technologies ?? [],
    title: job.title,
    workModel: job.workModel,
  };
}
