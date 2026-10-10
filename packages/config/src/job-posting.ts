// Regra única de "esta vaga tem JobPosting": o web usa para emitir o
// JSON-LD (apps/web/src/lib/job-seo.ts) e a API para decidir se a vaga vai
// para a Indexing API (URL_UPDATED). Página sem JobPosting não deve ser
// enviada: a Indexing API é só para páginas de vaga com o markup.

type JobPlaceFields = {
  city: string | null;
  country: string | null;
  state: string | null;
};

export type JobPostingEligibilityInput = JobPlaceFields & {
  employmentType: string | null;
  workModel: string | null;
};

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, "_");
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
export function resolveAddressCountry(job: JobPlaceFields): JobCountryClass {
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

// JobPosting só para vaga do Brasil que não é banco de talentos, com
// jobLocation válido (cidade, UF ou só o país, em vaga não remota) ou
// remota (applicantLocationRequirements = Brasil). Vaga do Brasil sempre
// cai num dos dois; "ambígua" (país sujo) e estrangeira ficam sem.
export function shouldEmitJobPosting(job: JobPostingEligibilityInput): boolean {
  if (isTalentPool(job.employmentType)) return false;
  const countryClass = resolveAddressCountry(job);
  if (countryClass === "foreign") return false;
  const isBr = countryClass === "BR";
  const isRemote = job.workModel === "remote";
  const hasJobLocation = isBr && !isRemote;
  const hasRemoteRequirement = isBr && isRemote;
  return hasJobLocation || hasRemoteRequirement;
}
