// Helpers puros do script de descoberta de fontes via beBee
// (scripts/discover-sources-from-bebee.ts).
//
// O beBee (bebee.com/br/jobs) não rastreia ATS: agrega feeds pagos
// (TheirStack, Fantastic Jobs, Techmap, Talent.com...). A página de detalhe
// de cada vaga é Next.js e embute no payload RSC o registro bruto do feed,
// incluindo `apply_url` (link de candidatura original, muitas vezes direto
// no ATS da empresa) e `publisher_name`. Usamos só isso — empresa + board de
// ATS — como semente da Descoberta de Empresas; o conteúdo da vaga em si
// continua vindo do nosso adapter, direto da fonte.

// Sufixo da URL do beBee que identifica o feed de origem
// (".../titulo-da-vaga--t7xk-870851774"). Só esses dois feeds trazem
// apply_url apontando pro ATS; os demais (Techmap/Catho, Divulga Vagas,
// agregadores CPC) apontam pra outro agregador ou pro próprio beBee.
export const BEBEE_ATS_ORIGINS = {
  fj: "Fantastic Jobs",
  t7xk: "TheirStack",
} as const;

export type BebeeOrigin = keyof typeof BEBEE_ATS_ORIGINS;

export function bebeeOriginOf(url: string): string | null {
  const match = url.match(/--([a-z]+[a-z0-9]*)[_-][^/]*$/);
  return match?.[1] ?? null;
}

export type BebeeJobLinks = {
  applyUrl: string | null;
  publisherName: string | null;
};

function decodeJsonString(raw: string) {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

// O payload RSC chega dentro de `self.__next_f.push([1,"..."])`, ou seja,
// JSON serializado DENTRO de uma string JS: as aspas aparecem como \" e os
// caracteres especiais como \\u0026. Desescapa um nível antes de procurar
// os campos.
export function parseBebeeJobPage(html: string): BebeeJobLinks {
  const unescaped = html.replace(/\\"/g, '"');
  const field = (name: string) => {
    const match = unescaped.match(
      new RegExp(`"${name}":"((?:[^"\\\\]|\\\\.)*)"`),
    );
    if (!match?.[1]) return null;
    const value = decodeJsonString(match[1].replace(/\\\\/g, "\\")).trim();
    return value || null;
  };

  return {
    applyUrl: field("apply_url"),
    publisherName: field("publisher_name"),
  };
}

// Hosts que nunca são board de ATS de uma empresa — o apply_url aponta pra
// outro agregador/rede. Não entram nem no relatório de "ATS sem adapter".
const AGGREGATOR_HOST_SUFFIXES = [
  "bebee.com",
  "catho.com.br",
  "divulgavagas.com.br",
  "glassdoor.com",
  "glassdoor.com.br",
  "indeed.com",
  "infojobs.com.br",
  "jooble.org",
  "linkedin.com",
  "talent.com",
  "trabalhabrasil.com.br",
  "vagas.com.br",
];

export function normalizeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isAggregatorHost(host: string) {
  return AGGREGATOR_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

// Plataformas em que o tenant mora no path, não no subdomínio.
const PATH_TENANT_HOSTS = new Set([
  "boards.greenhouse.io",
  "jobs.ashbyhq.com",
  "jobs.lever.co",
]);

// Identidade do board pra comparar com fontes/candidatos já cadastrados sem
// depender de detalhe cosmético da URL salva (barra final, "/jobs",
// pandape.infojobs x pandape, job-boards x boards.greenhouse).
export function boardKey(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }

  const host = parsed.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.pandape\.infojobs\.com\.br$/, ".pandape.com.br")
    .replace(/^job-boards\.greenhouse\.io$/, "boards.greenhouse.io");
  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  if (PATH_TENANT_HOSTS.has(host)) {
    return segments[0] ? `${host}/${segments[0]}` : null;
  }
  // Workday: o mesmo tenant pode ter mais de um site (".../External",
  // ".../Careers") — o site faz parte da identidade.
  if (host.endsWith(".myworkdayjobs.com")) {
    const site = segments.filter(
      (segment) => !/^[a-z]{2}-[a-z]{2}$/.test(segment),
    )[0];
    return site ? `${host}/${site}` : host;
  }
  return host;
}

// publisher_name vem do feed e às vezes é o título da página de carreiras
// em vez do nome da empresa ("Página de Carreira", "Trabalhe Conosco").
const GENERIC_NAME_PATTERNS = [
  /^pagina[- ]de[- ]carreira/,
  /^trabalhe[- ]conosco/,
  /^carreiras?$/,
  /^vagas?$/,
  /^jobs?$/,
  /^careers?$/,
  /^confidencial$/,
  /^empresa[- ]confidencial$/,
];

export function isGenericCompanyName(normalizedName: string) {
  return GENERIC_NAME_PATTERNS.some((pattern) => pattern.test(normalizedName));
}
