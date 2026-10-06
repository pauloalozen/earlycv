// Páginas perenes de SEO do Radar: definição de cada landing (filtros, URL,
// textos), agregados vindos da API (/internal/jobs/landings/*) e regras de
// indexação/linkagem. Plano: docs/specs/seo-paginas-perenes-radar.md.
//
// Sem "import server-only" pelo mesmo motivo de internal-jobs-api.ts: o
// sitemap.ts importa este módulo e roda nos testes via node:test puro.

import { toCompanySlug } from "./company-slug";

// Abaixo disso a landing não é indexável (noindex) e não entra no sitemap
// nem nos links internos — página quase vazia indexada é o que o Google
// trata como conteúdo raso.
export const MIN_INDEXABLE_JOBS = 5;
// Landing de tecnologia exige mais volume (já era a regra desde o Sprint 8).
export const MIN_TECH_JOBS = 10;

export type RadarLandingFilters = {
  area?: string;
  workModel?: string;
  seniority?: string;
  companyName?: string;
  technology?: string;
  city?: string;
  // Sigla da UF.
  state?: string;
};

export type CountItem = { value: string; count: number };
export type CompanyCount = { name: string; slug: string; count: number };
export type CityCount = {
  city: string;
  state: string;
  stateName: string;
  slug: string;
  count: number;
  // Grafias do banco ("São Paulo", "sao paulo") — a listagem casa todas.
  spellings?: string[];
};
type PairCount = { a: string; b: string; count: number };

export type RadarLandingIndex = {
  total: number;
  areas: CountItem[];
  seniorities: CountItem[];
  workModels: CountItem[];
  companies: CompanyCount[];
  technologies: CountItem[];
  cities: CityCount[];
  areaWorkModels: PairCount[];
  areaSeniorities: PairCount[];
  seniorityWorkModels: PairCount[];
};

export type RadarLandingSummary = {
  total: number;
  latestAt: string | null;
  newLast7Days: number;
  companies: CompanyCount[];
  technologies: CountItem[];
  workModels: CountItem[];
  seniorities: CountItem[];
  areas: CountItem[];
  cities: CityCount[];
};

export type RadarLandingKind =
  | "area"
  | "area-remote"
  | "area-junior"
  | "company"
  | "technology"
  | "remote"
  | "junior"
  | "senior"
  | "internship"
  | "internship-remote"
  | "city";

export type RadarViewType =
  | "area"
  | "junior"
  | "senior"
  | "remote"
  | "technology"
  | "company"
  | "internship"
  | "city";

export type RadarLanding = {
  kind: RadarLandingKind;
  path: string;
  filters: RadarLandingFilters;
  // UF para a listagem (Prisma, `in` sem caixa): sigla + nome por extenso,
  // porque vagas antigas guardam o nome. O panorama trata isso na API.
  listingState?: string;
  // Idem para a cidade: todas as grafias, separadas por vírgula.
  listingCity?: string;
  // h1 e base do <title>.
  heading: string;
  // Rótulo curto para links ("Dados e IA", "Python", "São Paulo (SP)").
  linkLabel: string;
  // Usado no meio de frases ("vagas de Dados e IA").
  subject: string;
  // Cargos típicos do recorte, para o texto de abertura.
  rolesHint?: string;
  breadcrumbs: Array<{ name: string; path: string }>;
  minIndexable: number;
  // Recorte sem nenhuma vaga vira 404 (empresa, cidade, tecnologia,
  // combinações). As landings-base (área, remotas, nível) continuam
  // existindo para o usuário, só não ficam indexáveis.
  notFoundWhenEmpty: boolean;
  tracker: {
    radarViewType: RadarViewType;
    area?: string;
    seniority?: string;
    technology?: string;
    remoteFilter?: boolean;
  };
};

// Nomes das áreas pensados para a busca (o rótulo curto do filtro, em
// radar-ui.tsx, continua sendo o da interface).
export const AREA_SEO: Record<string, { name: string; roles: string }> = {
  SOFTWARE_ENGINEERING: {
    name: "Desenvolvimento de Software",
    roles: "desenvolvedor back-end, front-end, full stack e mobile",
  },
  DATA_AI: {
    name: "Dados e IA",
    roles: "analista de dados, engenheiro de dados e cientista de dados",
  },
  IT_SUPPORT: {
    name: "Suporte e Infraestrutura de TI",
    roles: "analista de suporte, help desk e infraestrutura",
  },
  CYBERSECURITY: {
    name: "Segurança da Informação",
    roles: "analista de segurança, SOC e cibersegurança",
  },
  CLOUD_DEVOPS: {
    name: "Cloud e DevOps",
    roles: "engenheiro DevOps, SRE e engenheiro de cloud",
  },
  ERP_FUNCTIONAL: {
    name: "SAP e ERP",
    roles: "consultor SAP, TOTVS e sistemas ERP",
  },
  PRODUCT: {
    name: "Produto",
    roles: "product manager, product owner e analista de produto",
  },
  GROWTH_MARKETING: {
    name: "Growth e Marketing Digital",
    roles: "growth, performance e marketing digital",
  },
  ARCHITECTURE: {
    name: "Arquitetura de Software",
    roles: "arquiteto de software, de soluções e de dados",
  },
  LEADERSHIP: {
    name: "Liderança em Tecnologia",
    roles: "tech lead, coordenador e gerente de TI",
  },
  BUSINESS_ANALYTICS: {
    name: "Business Analytics",
    roles: "analista de negócios e analista de BI",
  },
  QA_TEST: {
    name: "QA e Testes",
    roles: "analista de QA e automação de testes",
  },
  PROJECT_AGILE: {
    name: "Gestão de Projetos",
    roles: "gerente de projetos, scrum master e agilista",
  },
  DESIGN_UX: {
    name: "Design e UX",
    roles: "UX/UI designer e product designer",
  },
  CX_DIGITAL: {
    name: "CX Digital",
    roles: "experiência do cliente digital",
  },
};

export function isLandingArea(area: string): boolean {
  return area in AREA_SEO;
}

const TECH_LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  "node.js": "Node.js",
  nodejs: "Node.js",
  "react native": "React Native",
  "power bi": "Power BI",
  "c#": "C#",
  "c++": "C++",
  ".net": ".NET",
  "asp.net": "ASP.NET",
  aws: "AWS",
  gcp: "GCP",
  sql: "SQL",
  "sql server": "SQL Server",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  nosql: "NoSQL",
  php: "PHP",
  html: "HTML",
  css: "CSS",
  sap: "SAP",
  "sap s/4hana": "SAP S/4HANA",
  abap: "ABAP",
  etl: "ETL",
  api: "API",
  apis: "APIs",
  rest: "REST",
  graphql: "GraphQL",
  "ci/cd": "CI/CD",
  devops: "DevOps",
  ios: "iOS",
  github: "GitHub",
  gitlab: "GitLab",
  powershell: "PowerShell",
  "machine learning": "Machine Learning",
  llm: "LLM",
  llms: "LLMs",
  ia: "IA",
  ai: "AI",
  bi: "BI",
  erp: "ERP",
  crm: "CRM",
  itil: "ITIL",
  seo: "SEO",
  ux: "UX",
  ui: "UI",
  qa: "QA",
  pl: "PL",
  "pl/sql": "PL/SQL",
  oracle: "Oracle",
  databricks: "Databricks",
  pyspark: "PySpark",
  bigquery: "BigQuery",
  "google cloud": "Google Cloud",
  vtex: "VTEX",
  totvs: "TOTVS",
  fluig: "Fluig",
};

export function technologyLabel(tech: string): string {
  const known = TECH_LABELS[tech.toLowerCase()];
  if (known) return known;
  return tech
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

// Slug de URL de uma tecnologia: as tecnologias chegam do enrichment em
// lowercase e às vezes com caracteres que não servem em URL ("c#", "ci/cd",
// "node.js", "power bi").
export function toTechnologySlug(tech: string): string {
  return toCompanySlug(
    tech
      .toLowerCase()
      .replace(/^\.net$/, "dotnet")
      .replace(/\.net\b/g, "-dotnet")
      .replace(/#/g, "-sharp")
      .replace(/\+\+/g, "pp")
      .replace(/\+/g, "-plus")
      .replace(/[./]/g, "-"),
  );
}

const LEGAL_SUFFIX = /[\s,.-]+(ltda\.?|s\.?\/?a\.?|eireli|me|epp)$/i;
const LOWERCASE_CONNECTORS = new Set(["de", "da", "do", "das", "dos", "e"]);

// Company.name vem cru da ingestão — muitas vezes a razão social em caixa
// alta ("BTG PACTUAL HOLDING DE SEGUROS LTDA."). Para título e texto, tira
// o sufixo societário e, só quando o nome inteiro está em caixa alta,
// normaliza a caixa (siglas curtas como "BRQ" ficam como estão).
export function companyDisplayName(rawName: string): string {
  // Aspas soltas vindas da ingestão (ex.: `"tivit`).
  let name = rawName
    .replace(/["'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 3 && LEGAL_SUFFIX.test(name); i++) {
    name = name.replace(LEGAL_SUFFIX, "").trim();
  }
  if (!name) name = rawName.trim();
  if (name !== name.toUpperCase()) return name;
  return name
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && LOWERCASE_CONNECTORS.has(lower)) return lower;
      if (/^[a-z]{1,3}$/i.test(word) || /[&\d]/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

const RADAR_CRUMB = { name: "Vagas", path: "/radar" };

export function areaLanding(area: string): RadarLanding | null {
  const seo = AREA_SEO[area];
  if (!seo) return null;
  const path = `/radar/area/${area.toLowerCase()}`;
  return {
    kind: "area",
    path,
    filters: { area },
    heading: `Vagas de ${seo.name}`,
    linkLabel: seo.name,
    subject: `vagas de ${seo.name}`,
    rolesHint: seo.roles,
    breadcrumbs: [RADAR_CRUMB, { name: seo.name, path }],
    minIndexable: MIN_INDEXABLE_JOBS,
    notFoundWhenEmpty: false,
    tracker: { radarViewType: "area", area },
  };
}

export function areaRemoteLanding(area: string): RadarLanding | null {
  const base = areaLanding(area);
  const seo = AREA_SEO[area];
  if (!base || !seo) return null;
  const path = `${base.path}/remoto`;
  return {
    ...base,
    kind: "area-remote",
    path,
    filters: { area, workModel: "remote" },
    heading: `Vagas remotas de ${seo.name}`,
    linkLabel: `${seo.name} remoto`,
    subject: `vagas remotas de ${seo.name}`,
    breadcrumbs: [...base.breadcrumbs, { name: "Remoto", path }],
    notFoundWhenEmpty: true,
    tracker: { radarViewType: "area", area, remoteFilter: true },
  };
}

export function areaJuniorLanding(area: string): RadarLanding | null {
  const base = areaLanding(area);
  const seo = AREA_SEO[area];
  if (!base || !seo) return null;
  const path = `${base.path}/junior`;
  return {
    ...base,
    kind: "area-junior",
    path,
    filters: { area, seniority: "JUNIOR" },
    heading: `Vagas júnior de ${seo.name}`,
    linkLabel: `${seo.name} júnior`,
    subject: `vagas júnior de ${seo.name}`,
    breadcrumbs: [...base.breadcrumbs, { name: "Júnior", path }],
    notFoundWhenEmpty: true,
    tracker: { radarViewType: "area", area, seniority: "JUNIOR" },
  };
}

export function companyLanding(rawName: string): RadarLanding {
  const display = companyDisplayName(rawName);
  const path = `/radar/empresa/${toCompanySlug(rawName)}`;
  return {
    kind: "company",
    path,
    filters: { companyName: rawName },
    heading: `Vagas ${display}`,
    linkLabel: display,
    subject: `vagas na empresa ${display}`,
    breadcrumbs: [RADAR_CRUMB, { name: display, path }],
    minIndexable: MIN_INDEXABLE_JOBS,
    notFoundWhenEmpty: true,
    tracker: { radarViewType: "company" },
  };
}

export function technologyLanding(tech: string): RadarLanding {
  const label = technologyLabel(tech);
  const path = `/radar/tecnologia/${toTechnologySlug(tech)}`;
  return {
    kind: "technology",
    path,
    filters: { technology: tech.toLowerCase() },
    heading: `Vagas de ${label}`,
    linkLabel: label,
    subject: `vagas que pedem ${label}`,
    breadcrumbs: [RADAR_CRUMB, { name: label, path }],
    minIndexable: MIN_TECH_JOBS,
    notFoundWhenEmpty: true,
    tracker: { radarViewType: "technology", technology: tech.toLowerCase() },
  };
}

export function remoteLanding(): RadarLanding {
  const path = "/radar/remotas";
  return {
    kind: "remote",
    path,
    filters: { workModel: "remote" },
    heading: "Vagas remotas de tecnologia",
    linkLabel: "Vagas remotas",
    subject: "vagas remotas (home office) de tecnologia",
    rolesHint: "desenvolvimento, dados, cloud, produto e suporte",
    breadcrumbs: [RADAR_CRUMB, { name: "Remotas", path }],
    minIndexable: MIN_INDEXABLE_JOBS,
    notFoundWhenEmpty: false,
    tracker: { radarViewType: "remote", remoteFilter: true },
  };
}

export function juniorLanding(): RadarLanding {
  const path = "/radar/junior";
  return {
    kind: "junior",
    path,
    filters: { seniority: "JUNIOR" },
    heading: "Vagas júnior de tecnologia",
    linkLabel: "Vagas júnior",
    subject: "vagas júnior de tecnologia",
    rolesHint: "primeiro emprego e início de carreira em TI",
    breadcrumbs: [RADAR_CRUMB, { name: "Júnior", path }],
    minIndexable: MIN_INDEXABLE_JOBS,
    notFoundWhenEmpty: false,
    tracker: { radarViewType: "junior", seniority: "JUNIOR" },
  };
}

export function seniorLanding(): RadarLanding {
  const path = "/radar/senior";
  return {
    kind: "senior",
    path,
    filters: { seniority: "SENIOR" },
    heading: "Vagas sênior de tecnologia",
    linkLabel: "Vagas sênior",
    subject: "vagas sênior de tecnologia",
    breadcrumbs: [RADAR_CRUMB, { name: "Sênior", path }],
    minIndexable: MIN_INDEXABLE_JOBS,
    notFoundWhenEmpty: false,
    tracker: { radarViewType: "senior", seniority: "SENIOR" },
  };
}

export function internshipLanding(): RadarLanding {
  const path = "/radar/estagio";
  return {
    kind: "internship",
    path,
    filters: { seniority: "INTERN" },
    heading: "Vagas de estágio em TI e tecnologia",
    linkLabel: "Estágio em TI",
    subject: "vagas de estágio em tecnologia",
    rolesHint: "estágio em desenvolvimento, dados, suporte e produto",
    breadcrumbs: [RADAR_CRUMB, { name: "Estágio", path }],
    minIndexable: MIN_INDEXABLE_JOBS,
    notFoundWhenEmpty: false,
    tracker: { radarViewType: "internship", seniority: "INTERN" },
  };
}

export function internshipRemoteLanding(): RadarLanding {
  const base = internshipLanding();
  const path = `${base.path}/remoto`;
  return {
    ...base,
    kind: "internship-remote",
    path,
    filters: { seniority: "INTERN", workModel: "remote" },
    heading: "Vagas de estágio remoto em TI",
    linkLabel: "Estágio remoto",
    subject: "vagas de estágio remoto (home office) em tecnologia",
    breadcrumbs: [...base.breadcrumbs, { name: "Remoto", path }],
    notFoundWhenEmpty: true,
    tracker: {
      radarViewType: "internship",
      seniority: "INTERN",
      remoteFilter: true,
    },
  };
}

export function cityLanding(city: {
  city: string;
  state: string;
  stateName?: string;
  slug: string;
  spellings?: string[];
}): RadarLanding {
  const path = `/radar/cidade/${city.slug}`;
  const label = `${city.city} (${city.state})`;
  return {
    kind: "city",
    path,
    filters: { city: city.city, state: city.state },
    listingState: city.stateName
      ? `${city.state},${city.stateName}`
      : city.state,
    listingCity: city.spellings?.length ? city.spellings.join(",") : city.city,
    heading: `Vagas de tecnologia em ${city.city}`,
    linkLabel: label,
    subject: `vagas de tecnologia em ${label}`,
    breadcrumbs: [RADAR_CRUMB, { name: label, path }],
    minIndexable: MIN_INDEXABLE_JOBS,
    notFoundWhenEmpty: true,
    tracker: { radarViewType: "city" },
  };
}

function pairCount(pairs: PairCount[], a: string, b: string): number {
  return pairs.find((pair) => pair.a === a && pair.b === b)?.count ?? 0;
}

function countOf(items: CountItem[], value: string): number {
  return items.find((item) => item.value === value)?.count ?? 0;
}

export type EligibleLanding = { landing: RadarLanding; count: number };

// Todas as landings indexáveis agora, com o volume de cada uma — fonte do
// sitemap e dos blocos de links internos.
export function listEligibleLandings(
  index: RadarLandingIndex,
): EligibleLanding[] {
  const result: EligibleLanding[] = [];
  const push = (landing: RadarLanding | null, count: number) => {
    if (landing && count >= landing.minIndexable) {
      result.push({ landing, count });
    }
  };

  push(remoteLanding(), countOf(index.workModels, "remote"));
  push(juniorLanding(), countOf(index.seniorities, "JUNIOR"));
  push(seniorLanding(), countOf(index.seniorities, "SENIOR"));
  push(internshipLanding(), countOf(index.seniorities, "INTERN"));
  push(
    internshipRemoteLanding(),
    pairCount(index.seniorityWorkModels, "INTERN", "remote"),
  );

  for (const area of index.areas) {
    push(areaLanding(area.value), area.count);
    push(
      areaRemoteLanding(area.value),
      pairCount(index.areaWorkModels, area.value, "remote"),
    );
    push(
      areaJuniorLanding(area.value),
      pairCount(index.areaSeniorities, area.value, "JUNIOR"),
    );
  }

  for (const tech of index.technologies) {
    push(technologyLanding(tech.value), tech.count);
  }
  for (const city of index.cities) {
    push(cityLanding(city), city.count);
  }
  for (const company of index.companies) {
    push(companyLanding(company.name), company.count);
  }

  return result;
}

export function findCompanyBySlug(
  index: RadarLandingIndex,
  slug: string,
): CompanyCount | null {
  return index.companies.find((company) => company.slug === slug) ?? null;
}

export function findCityBySlug(
  index: RadarLandingIndex,
  slug: string,
): CityCount | null {
  return index.cities.find((city) => city.slug === slug) ?? null;
}

// Slug da URL → tecnologia como está no enrichment. Sem correspondência no
// índice, o próprio slug é a tecnologia (URLs antigas como
// /radar/tecnologia/python continuam iguais).
export function resolveTechnologySlug(
  index: RadarLandingIndex | null,
  slug: string,
): string {
  const normalized = decodeSafe(slug).toLowerCase();
  const match = index?.technologies.find(
    (tech) => toTechnologySlug(tech.value) === toTechnologySlug(normalized),
  );
  return match?.value ?? normalized;
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const numberFormat = new Intl.NumberFormat("pt-BR");

export function formatCount(count: number): string {
  return numberFormat.format(count);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function landingSeoTitle(
  landing: RadarLanding,
  summary: RadarLandingSummary | null,
  page: number,
): string {
  const base =
    summary && summary.total > 0
      ? `${landing.heading}: ${formatCount(summary.total)} ${summary.total === 1 ? "vaga aberta" : "vagas abertas"}`
      : landing.heading;
  return page > 1 ? `${base} — página ${page}` : base;
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : cut.length).replace(/[,;:\s]+$/, "")}…`;
}

export function landingSeoDescription(
  landing: RadarLanding,
  summary: RadarLandingSummary | null,
): string {
  if (!summary || summary.total === 0) {
    return truncateAtWord(
      `${capitalize(landing.subject)} com score de compatibilidade com o seu CV. Analise grátis e adapte o currículo para cada vaga.`,
      160,
    );
  }
  const companies = summary.companies
    .slice(0, landing.kind === "company" ? 0 : 3)
    .map((company) => companyDisplayName(company.name));
  const parts = [
    `${formatCount(summary.total)} ${landing.subject} abertas agora`,
    companies.length > 0 ? ` em empresas como ${joinList(companies)}` : "",
    ". Veja a compatibilidade com o seu CV e adapte o currículo em segundos.",
  ];
  return truncateAtWord(parts.join(""), 160);
}

// Parágrafo de abertura da landing: só fatos vindos dos dados.
export function landingIntro(
  landing: RadarLanding,
  summary: RadarLandingSummary,
): string {
  const sentences: string[] = [];
  const total = formatCount(summary.total);
  const fresh =
    summary.newLast7Days > 0
      ? `, ${formatCount(summary.newLast7Days)} publicadas nos últimos 7 dias`
      : "";
  sentences.push(
    `${summary.total === 1 ? "1 vaga aberta" : `${total} vagas abertas`} agora${fresh}.`,
  );
  if (landing.rolesHint) {
    sentences.push(`Inclui oportunidades de ${landing.rolesHint}.`);
  }
  if (landing.kind !== "company") {
    const companies = summary.companies
      .slice(0, 3)
      .map((company) => companyDisplayName(company.name));
    if (companies.length > 0) {
      sentences.push(`Quem mais contrata: ${joinList(companies)}.`);
    }
  }
  if (landing.kind !== "technology") {
    const techs = summary.technologies
      .slice(0, 4)
      .map((tech) => technologyLabel(tech.value));
    if (techs.length > 0) {
      sentences.push(`Tecnologias mais pedidas: ${joinList(techs)}.`);
    }
  }
  return sentences.join(" ");
}

export const WORK_MODEL_LABELS: Record<string, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  onsite: "Presencial",
  "on-site": "Presencial",
};

export const SENIORITY_LABELS: Record<string, string> = {
  INTERN: "Estágio",
  JUNIOR: "Júnior",
  MID: "Pleno",
  SENIOR: "Sênior",
  LEAD: "Lead",
  STAFF: "Staff",
  MANAGER: "Gerência",
  DIRECTOR: "Diretoria",
};

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export type LandingFaqItem = { question: string; answer: string };

// Perguntas e respostas montadas com os números do recorte — conteúdo
// próprio de cada página, sem texto genérico repetido.
export function landingFaq(
  landing: RadarLanding,
  summary: RadarLandingSummary,
): LandingFaqItem[] {
  const items: LandingFaqItem[] = [];
  const total = formatCount(summary.total);
  items.push({
    question: `Quantas ${landing.subject} estão abertas?`,
    answer: `Agora o EarlyCV tem ${total} ${summary.total === 1 ? "vaga aberta" : "vagas abertas"} nesse recorte${summary.newLast7Days > 0 ? `, sendo ${formatCount(summary.newLast7Days)} publicadas nos últimos 7 dias` : ""}. A lista é atualizada várias vezes ao dia a partir dos sites de carreira das empresas.`,
  });

  const remote = summary.workModels.find((item) => item.value === "remote");
  if (landing.filters.workModel !== "remote") {
    items.push({
      question: `Existem ${landing.subject} em home office?`,
      answer:
        remote && remote.count > 0
          ? `Sim. ${formatCount(remote.count)} das vagas (${percent(remote.count, summary.total)}%) são 100% remotas; as demais são híbridas ou presenciais.`
          : "No momento as vagas desse recorte são híbridas ou presenciais. Vale ativar o Alerta de Vaga Certa para saber quando surgir uma remota.",
    });
  }

  if (landing.kind !== "company" && summary.companies.length > 0) {
    const companies = summary.companies
      .slice(0, 5)
      .map((company) => companyDisplayName(company.name));
    items.push({
      question: "Quais empresas estão contratando?",
      answer: `As empresas com mais vagas abertas agora são ${joinList(companies)}.`,
    });
  }

  items.push({
    question: "Como aumentar as chances de ser chamado?",
    answer:
      "Os processos seletivos usam sistemas de triagem (ATS) que comparam o currículo com a descrição da vaga. No EarlyCV você vê a compatibilidade do seu CV com cada vaga e gera uma versão adaptada, com as palavras-chave certas, antes de se candidatar.",
  });
  return items;
}

export type LandingLinkGroup = {
  title: string;
  links: Array<{ href: string; label: string; count: number }>;
};

// Links internos de uma landing para outras landings indexáveis — o que
// faz o conjunto funcionar como um site (e não como páginas soltas).
export function landingRelatedLinks(
  landing: RadarLanding | null,
  summary: RadarLandingSummary | null,
  index: RadarLandingIndex,
): LandingLinkGroup[] {
  const eligible = listEligibleLandings(index);
  const byPath = new Map(eligible.map((item) => [item.landing.path, item]));
  const isSelf = (item: EligibleLanding) => item.landing.path === landing?.path;
  const groups: LandingLinkGroup[] = [];
  const toLink = (item: EligibleLanding) => ({
    href: item.landing.path,
    label: item.landing.linkLabel,
    count: item.count,
  });
  const addGroup = (title: string, items: EligibleLanding[], max: number) => {
    const links = items
      .filter((item) => !isSelf(item))
      .slice(0, max)
      .map(toLink);
    if (links.length > 0) groups.push({ title, links });
  };

  // Recortes da mesma área (remoto/júnior), quando a página é de área.
  if (landing?.filters.area) {
    const area = landing.filters.area;
    addGroup(
      "Recortes desta área",
      [areaLanding(area), areaRemoteLanding(area), areaJuniorLanding(area)]
        .map((item) => (item ? byPath.get(item.path) : undefined))
        .filter((item): item is EligibleLanding => !!item),
      3,
    );
  }

  const modality = [
    remoteLanding(),
    internshipLanding(),
    internshipRemoteLanding(),
    juniorLanding(),
    seniorLanding(),
  ]
    .map((item) => byPath.get(item.path))
    .filter((item): item is EligibleLanding => !!item);
  addGroup("Por modalidade e nível", modality, 5);

  const techSource = summary?.technologies.length
    ? summary.technologies.map((tech) =>
        byPath.get(technologyLanding(tech.value).path),
      )
    : eligible.filter((item) => item.landing.kind === "technology");
  addGroup(
    "Por tecnologia",
    techSource.filter((item): item is EligibleLanding => !!item),
    12,
  );

  addGroup(
    "Por área",
    eligible.filter((item) => item.landing.kind === "area"),
    15,
  );

  const citySource = summary?.cities.length
    ? summary.cities.map((city) => byPath.get(cityLanding(city).path))
    : eligible.filter((item) => item.landing.kind === "city");
  addGroup(
    "Por cidade",
    citySource.filter((item): item is EligibleLanding => !!item),
    10,
  );

  const companySource = summary?.companies.length
    ? summary.companies.map((company) =>
        byPath.get(companyLanding(company.name).path),
      )
    : eligible.filter((item) => item.landing.kind === "company");
  addGroup(
    "Empresas contratando",
    companySource.filter((item): item is EligibleLanding => !!item),
    10,
  );

  return groups;
}

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return base.endsWith("/api") ? base : `${base}/api`;
}

function isLandingIndex(
  data: Partial<RadarLandingIndex> | null,
): data is RadarLandingIndex {
  return (
    !!data &&
    typeof data === "object" &&
    [
      data.areas,
      data.seniorities,
      data.workModels,
      data.companies,
      data.technologies,
      data.cities,
      data.areaWorkModels,
      data.areaSeniorities,
      data.seniorityWorkModels,
    ].every(Array.isArray)
  );
}

// Endpoints sem auth (dados já públicos em /radar), mesma justificativa de
// internal-jobs-api.ts. Cache de 5 min: os números mudam ao longo do dia,
// não a cada request. Falha vira null — a página segue renderizando sem o
// bloco de panorama em vez de quebrar.
export async function getRadarLandingIndex(): Promise<RadarLandingIndex | null> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/internal/jobs/landings/index`,
      { next: { revalidate: 300 } },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<RadarLandingIndex> | null;
    return isLandingIndex(data) ? data : null;
  } catch {
    return null;
  }
}

export async function getRadarLandingSummary(
  filters: RadarLandingFilters,
): Promise<RadarLandingSummary | null> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/internal/jobs/landings/summary?${params.toString()}`,
      { next: { revalidate: 300 } },
    );
    if (!response.ok) return null;
    return (await response.json()) as RadarLandingSummary;
  } catch {
    return null;
  }
}

// Links da página de vaga para as landings em que ela se encaixa — só as
// indexáveis (com volume). Sem índice (API fora), cai nos links de sempre
// (área, empresa e remotas), que existem para qualquer vaga.
export function jobLandingLinks(
  job: {
    company: string;
    dominantArea: string | null;
    workModel: string | null;
    city: string | null;
    state: string | null;
    technologies: string[];
  },
  index: RadarLandingIndex | null,
): Array<{ href: string; label: string }> {
  const area = job.dominantArea ? areaLanding(job.dominantArea) : null;
  const isRemote = job.workModel === "remote";

  if (!index) {
    const links: Array<{ href: string; label: string }> = [];
    if (area) {
      links.push({ href: area.path, label: `← Todas as ${area.subject}` });
    }
    links.push({
      href: companyLanding(job.company).path,
      label: `Vagas ${companyDisplayName(job.company)}`,
    });
    if (isRemote) {
      links.push({ href: remoteLanding().path, label: "Ver vagas remotas" });
    }
    return links;
  }

  const eligible = new Set(
    listEligibleLandings(index).map((item) => item.landing.path),
  );
  const candidates: Array<{ landing: RadarLanding | null; label: string }> = [];
  if (area) {
    candidates.push({ landing: area, label: `← Todas as ${area.subject}` });
  }
  if (job.dominantArea && isRemote) {
    const areaRemote = areaRemoteLanding(job.dominantArea);
    candidates.push({
      landing: areaRemote,
      label: areaRemote ? capitalize(areaRemote.subject) : "",
    });
  }
  candidates.push({
    landing: companyLanding(job.company),
    label: `Vagas ${companyDisplayName(job.company)}`,
  });
  if (job.city && job.state) {
    const jobCitySlug = toCompanySlug(job.city);
    const jobState = job.state.trim().toUpperCase();
    const city = index.cities.find(
      (item) =>
        toCompanySlug(item.city) === jobCitySlug && item.state === jobState,
    );
    if (city) {
      candidates.push({
        landing: cityLanding(city),
        label: `Vagas em ${city.city}`,
      });
    }
  }
  if (isRemote) {
    candidates.push({ landing: remoteLanding(), label: "Vagas remotas" });
  }
  let techLinks = 0;
  for (const tech of job.technologies) {
    if (techLinks >= 2) break;
    const landing = technologyLanding(tech);
    if (!eligible.has(landing.path)) continue;
    candidates.push({ landing, label: `Vagas de ${landing.linkLabel}` });
    techLinks += 1;
  }

  const seen = new Set<string>();
  return candidates.flatMap(({ landing, label }) => {
    if (!landing || !eligible.has(landing.path) || seen.has(landing.path)) {
      return [];
    }
    seen.add(landing.path);
    return [{ href: landing.path, label }];
  });
}
