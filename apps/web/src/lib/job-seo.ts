import { formatJobTitle } from "@earlycv/config/job-display";
import type { PublicJob } from "@/lib/public-jobs-api";
import { companyDisplayName } from "@/lib/radar-landings";
import { getAbsoluteUrl, siteConfig } from "@/lib/site";

// Helpers de SEO da página de vaga (/radar/[slug]): <title>, meta
// description e campos do JobPosting. Funções puras: a mesma vaga gera o
// mesmo texto na rota dinâmica e na rota ISR do anônimo.

type JobSeoInput = Pick<
  PublicJob,
  "city" | "company" | "country" | "state" | "title" | "workModel"
>;

const SEO_TITLE_MAX = 60;
const SEO_TITLE_SUFFIX = " | EarlyCV";
const SEO_DESCRIPTION_MAX = 155;

// Cargo para exibição: sem o prefixo "[Job-N]" do Lever da CI&T e, quando
// veio inteiro em caixa alta, em caixa de título (ver formatJobTitle).
export function cleanJobTitleForDisplay(title: string): string {
  return formatJobTitle(title);
}

// "Remoto" para vaga remota; senão a cidade; senão nada.
export function jobSeoLocation(job: JobSeoInput): string | null {
  if (job.workModel === "remote") return "Remoto";
  return job.city?.trim() || null;
}

// `${cargo} na ${empresa} (${local}) | EarlyCV`, alvo de 60 caracteres:
// passando, sai o (local); ainda passando, a empresa é cortada por palavra.
// O cargo nunca é cortado: se só ele já estoura, o título fica sem empresa.
export function buildJobSeoTitle(job: JobSeoInput): string {
  const cargo = cleanJobTitleForDisplay(job.title);
  const empresa = companyDisplayName(job.company);
  const local = jobSeoLocation(job);

  const withLocal = `${cargo} na ${empresa}${local ? ` (${local})` : ""}${SEO_TITLE_SUFFIX}`;
  if (withLocal.length <= SEO_TITLE_MAX) return withLocal;

  const withCompany = `${cargo} na ${empresa}${SEO_TITLE_SUFFIX}`;
  if (withCompany.length <= SEO_TITLE_MAX) return withCompany;

  const words = empresa.split(" ");
  for (let count = words.length - 1; count > 0; count--) {
    const truncated = `${cargo} na ${words.slice(0, count).join(" ")}…${SEO_TITLE_SUFFIX}`;
    if (truncated.length <= SEO_TITLE_MAX) return truncated;
  }

  return `${cargo}${SEO_TITLE_SUFFIX}`;
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

export function buildJobSeoDescription(job: JobSeoInput): string {
  const cargo = cleanJobTitleForDisplay(job.title);
  const empresa = companyDisplayName(job.company);
  const local = jobSeoLocation(job);
  return truncateAtWord(
    `Vaga de ${cargo} na ${empresa}${local ? `, ${local}` : ""}. Veja grátis sua compatibilidade com a vaga e adapte seu currículo em minutos no EarlyCV.`,
    SEO_DESCRIPTION_MAX,
  );
}

// employmentType chega cru de cada adapter ("full_time", "CLT", "Full time",
// "estágio", "vacancy_type_trainee"...). Chave normalizada: minúsculas, sem
// acento, separadores viram "_". Valor fora do mapa: o campo é omitido.
const SCHEMA_EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: "FULL_TIME",
  fulltime: "FULL_TIME",
  clt: "FULL_TIME",
  efetivo: "FULL_TIME",
  trainee: "FULL_TIME",
  vacancy_type_trainee: "FULL_TIME",
  part_time: "PART_TIME",
  parttime: "PART_TIME",
  partial_time: "PART_TIME",
  meio_periodo: "PART_TIME",
  estagio: "INTERN",
  internship: "INTERN",
  apprentice: "INTERN",
  pj: "CONTRACTOR",
  contractor: "CONTRACTOR",
  autonomous: "CONTRACTOR",
  cooperado: "CONTRACTOR",
  vacancy_type_outsource: "CONTRACTOR",
  temporary: "TEMPORARY",
  temporario: "TEMPORARY",
};

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, "_");
}

export function toSchemaEmploymentType(
  value: string | null,
): string | undefined {
  if (!value) return undefined;
  return SCHEMA_EMPLOYMENT_TYPE[normalizeKey(value)];
}

// Banco de talentos não é vaga aberta: a política do Google proíbe
// JobPosting nesse caso.
export function isTalentPool(employmentType: string | null): boolean {
  return !!employmentType && normalizeKey(employmentType) === "talent_pool";
}

const BR_UF =
  /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;
const BR_COUNTRY = /(^|[^a-z])(brasil|brazil|br|bra)([^a-z]|$)/i;
const BR_PLACE_IN_COUNTRY =
  /(s[aã]o paulo|rio de janeiro|teletrabalho|remoto)/i;
const FOREIGN_PLACE =
  /(\busa\b|united|canada|portugal|france|germany|ireland|netherlands|spain|italy|colombia|mexic|argentin|chile|north america|^nl$)/i;

export type JobCountryClass = "BR" | "foreign" | "ambiguous";

// O campo country é sujo ("SP", "Remote; Texas", "Rio de Janeiro ou
// Teletrabalho"): só conta como Brasil com sinal claro, e só como
// estrangeira com nome de outro país. Os dois sinais juntos, ou nenhum,
// ficam ambíguos.
export function resolveAddressCountry(
  job: Pick<JobSeoInput, "city" | "country" | "state">,
): JobCountryClass {
  const country = job.country?.trim() ?? "";
  const state = job.state?.trim() ?? "";
  const city = job.city?.trim() ?? "";

  const isBr =
    BR_COUNTRY.test(country) ||
    BR_COUNTRY.test(city) ||
    BR_UF.test(country) ||
    BR_UF.test(state) ||
    BR_PLACE_IN_COUNTRY.test(country);
  const isForeign =
    FOREIGN_PLACE.test(country) ||
    FOREIGN_PLACE.test(state) ||
    FOREIGN_PLACE.test(city);

  if (isBr && !isForeign) return "BR";
  if (isForeign && !isBr) return "foreign";
  return "ambiguous";
}

type JobPostingInput = JobSeoInput &
  Pick<
    PublicJob,
    | "companyLogoUrl"
    | "companyWebsiteUrl"
    | "description"
    | "employmentType"
    | "externalJobId"
    | "firstSeenAt"
    | "lastSeenAt"
    | "publishedAtSource"
    | "slug"
  >;

// JobPosting da vaga aberta, ou null quando a vaga não deve ter markup:
// - banco de talentos (não é vaga aberta);
// - vaga estrangeira (o EarlyCV só aceita vagas do Brasil: é bug de carga);
// - sem jobLocation válido e sem a combinação remota TELECOMMUTE +
//   applicantLocationRequirements (JSON-LD inválido é pior que ausente).
export function buildJobPostingJsonLd(
  job: JobPostingInput,
): Record<string, unknown> | null {
  if (isTalentPool(job.employmentType)) return null;

  const countryClass = resolveAddressCountry(job);
  if (countryClass === "foreign") return null;

  const isRemote = job.workModel === "remote";
  const isBr = countryClass === "BR";

  // job.city/job.state já vêm normalizados (geo-normalizer.ts, na
  // ingestão): city em title case, state como sigla de UF. Sem cidade nem
  // estado, ou sem país confiável, jobLocation é omitido: nunca inventar
  // localização só pra preencher o schema.
  const jobLocation =
    isBr && (job.city || job.state)
      ? {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            ...(job.city ? { addressLocality: job.city } : {}),
            ...(job.state ? { addressRegion: job.state } : {}),
            addressCountry: "BR",
          },
        }
      : undefined;
  const applicantLocationRequirements =
    isRemote && isBr ? { "@type": "Country", name: "Brasil" } : undefined;

  if (!jobLocation && !applicantLocationRequirements) return null;

  const cargo = cleanJobTitleForDisplay(job.title);
  const empresa = companyDisplayName(job.company);
  const employmentType = toSchemaEmploymentType(job.employmentType);
  const logo = job.companyLogoUrl
    ? new URL(job.companyLogoUrl, siteConfig.siteUrl).toString()
    : undefined;
  // Calculado (a fonte não informa prazo): a vaga sai do ar quando o
  // crawler deixa de vê-la, e lastSeenAt é renovado a cada visita.
  const validThrough = new Date(
    new Date(job.lastSeenAt).getTime() + 30 * 86_400_000,
  ).toISOString();

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: cargo,
    // Vaga sem descriptionClean nunca chega aqui em teoria (a query pública
    // já exige título+descrição não vazios), mas o fallback evita um
    // JobPosting com description: "" reprovando no Rich Results Test.
    description:
      job.description.trim() ||
      `Vaga de ${cargo} na ${empresa}. Candidate-se e adapte seu CV com IA.`,
    datePosted: job.publishedAtSource ?? job.firstSeenAt,
    validThrough,
    ...(employmentType ? { employmentType } : {}),
    hiringOrganization: {
      "@type": "Organization",
      name: empresa,
      ...(job.companyWebsiteUrl ? { sameAs: job.companyWebsiteUrl } : {}),
      ...(logo ? { logo } : {}),
    },
    ...(jobLocation ? { jobLocation } : {}),
    ...(isRemote ? { jobLocationType: "TELECOMMUTE" } : {}),
    ...(applicantLocationRequirements ? { applicantLocationRequirements } : {}),
    // A candidatura acontece no site da empresa/ATS (ExternalApplyGate), não
    // no EarlyCV: declarar true viola a diretriz de JobPosting do Google.
    directApply: false,
    url: getAbsoluteUrl(`/radar/${job.slug}`),
    ...(job.externalJobId
      ? {
          identifier: {
            "@type": "PropertyValue",
            name: empresa,
            value: job.externalJobId,
          },
        }
      : {}),
  };
}
