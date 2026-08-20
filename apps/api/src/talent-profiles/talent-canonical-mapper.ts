import type {
  JobArea,
  SeniorityLevel,
  TalentCompetencyCategory,
} from "@prisma/client";

// Mesmo shape de CanonicalProfile em packages/ai/src/master-cv-canonical-extraction.ts
// — duplicado localmente (mesmo padrão de master-cv-canonical-extraction.types.ts)
// porque importar um type de @earlycv/ai num arquivo compilado via `nest build`
// (CommonJS) esbarra na exigência de resolution-mode do TS pra import type de
// pacote ESM.
export type CanonicalProfile = {
  fullName: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  location: {
    city: string | null;
    state: string | null;
    country: string | null;
  };
  professionalSummary: string | null;
  experiences: Array<{
    role: string | null;
    company: string | null;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    bullets: string[];
    technologies: string[];
  }>;
  education: Array<{
    institution: string | null;
    degree: string | null;
    fieldOfStudy: string | null;
    startDate: string | null;
    endDate: string | null;
  }>;
  skills: string[];
  languages: Array<{
    language: string;
    level: string | null;
  }>;
  certifications: Array<{
    name: string;
    issuer: string | null;
    year: string | null;
  }>;
  radarProfile: {
    areas: string[];
    seniority: string;
    careerFingerprint: string[];
  };
};

// Traduz a saída da extração canônica por IA (packages/ai — mesmo prompt já
// usado pelo CV master, ver master-cv-canonical-extraction.ts) para as
// tabelas normalizadas da Base de Talentos. Fase 2 (ver AGENTS.md "v3.2") —
// sempre provenance EXTRACTED_IA, nunca sobrescreve provenance mais forte
// (DECLARED_BY_USER) já presente, só preenche o que a IA sabe.
//
// Funções puras — sem I/O, fáceis de testar sem banco/IA.

const RADAR_SENIORITY_TO_TALENT: Record<string, SeniorityLevel> = {
  INTERN: "INTERN",
  JUNIOR: "JUNIOR",
  MID: "MID",
  SENIOR: "SENIOR",
  LEAD: "LEAD",
  STAFF: "STAFF",
  MANAGER: "MANAGER",
  DIRECTOR: "DIRECTOR",
  UNKNOWN: "UNKNOWN",
};

// radarProfile.areas do prompt não inclui todas as JobArea do schema (ex:
// GROWTH_MARKETING, IT_SUPPORT não fazem parte do vocabulário do prompt
// hoje) — filtra pra só os valores realmente válidos no schema em vez de
// assumir que todo string retornado bate 1:1.
const VALID_JOB_AREAS = new Set<string>([
  "DATA_AI",
  "SOFTWARE_ENGINEERING",
  "CLOUD_DEVOPS",
  "CYBERSECURITY",
  "PRODUCT",
  "DESIGN_UX",
  "QA_TEST",
  "PROJECT_AGILE",
  "ARCHITECTURE",
  "LEADERSHIP",
  "GROWTH_MARKETING",
  "BUSINESS_ANALYTICS",
  "CX_DIGITAL",
  "IT_SUPPORT",
  "ERP_FUNCTIONAL",
]);

export function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// A IA às vezes escreve o mesmo idioma em português, em inglês, ou sem
// acento ("Inglês" / "English" / "Ingles") dependendo do CV — sem
// normalizar, isso vira linhas duplicadas em TalentLanguageSkill pra
// mesma pessoa (achado revisando o piloto de produção: 81 linhas, só 11
// valores distintos, a maioria eram a mesma língua escrita diferente).
// Canoniza pro rótulo em português (produto é BR); nomes não mapeados
// passam por normalize() + title case, sem inventar tradução.
const LANGUAGE_CANONICAL_LABEL: Record<string, string> = {
  ingles: "Inglês",
  english: "Inglês",
  espanhol: "Espanhol",
  spanish: "Espanhol",
  portugues: "Português",
  portuguese: "Português",
  italiano: "Italiano",
  italian: "Italiano",
  frances: "Francês",
  french: "Francês",
  alemao: "Alemão",
  german: "Alemão",
  mandarim: "Mandarim",
  mandarin: "Mandarim",
  chines: "Mandarim",
  chinese: "Mandarim",
  japones: "Japonês",
  japanese: "Japonês",
  libras: "Libras",
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function canonicalLanguageLabel(raw: string): string {
  const key = stripAccents(normalize(raw));
  const canonical = LANGUAGE_CANONICAL_LABEL[key];
  if (canonical) return canonical;
  const trimmed = raw.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// Mesmo problema das línguas, mas pra tecnologia/skill: a IA (e o próprio
// CV) mistura sigla e nome por extenso pro mesmo item — "JS" e
// "Javascript", "K8s" e "Kubernetes", "PBI" e "Power BI" viravam
// competências DIFERENTES pra mesma coisa. Cobre só os casos mais comuns em
// CV de tech BR (não é uma taxonomia completa); qualquer coisa fora daqui
// só normaliza espaço/maiúscula, sem inventar expansão de sigla.
const TECH_CANONICAL_LABEL: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  py: "Python",
  python: "Python",
  node: "Node.js",
  nodejs: "Node.js",
  "node.js": "Node.js",
  react: "React",
  reactjs: "React",
  "react.js": "React",
  vue: "Vue.js",
  vuejs: "Vue.js",
  angular: "Angular",
  k8s: "Kubernetes",
  kubernetes: "Kubernetes",
  docker: "Docker",
  aws: "AWS",
  "amazon web services": "AWS",
  gcp: "GCP",
  "google cloud": "GCP",
  "google cloud platform": "GCP",
  azure: "Azure",
  "microsoft azure": "Azure",
  pbi: "Power BI",
  "power bi": "Power BI",
  powerbi: "Power BI",
  sql: "SQL",
  postgresql: "PostgreSQL",
  postgres: "PostgreSQL",
  psql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  mongo: "MongoDB",
  ml: "Machine Learning",
  "machine learning": "Machine Learning",
  ia: "Inteligência Artificial",
  ai: "Inteligência Artificial",
  "inteligencia artificial": "Inteligência Artificial",
  "c#": "C#",
  csharp: "C#",
  "c++": "C++",
  cpp: "C++",
  golang: "Go",
  go: "Go",
  excel: "Excel",
  "ms excel": "Excel",
  "microsoft excel": "Excel",
  git: "Git",
  github: "GitHub",
  gitlab: "GitLab",
  scrum: "Scrum",
  kanban: "Kanban",
  agile: "Ágil",
  agil: "Ágil",
  api: "API",
  apis: "API",
  "rest api": "REST API",
  restapi: "REST API",
  ci_cd: "CI/CD",
  "ci/cd": "CI/CD",
};

export function canonicalTechLabel(raw: string): string {
  const key = stripAccents(normalize(raw)).replace(/\s+/g, " ");
  const canonical = TECH_CANONICAL_LABEL[key];
  if (canonical) return canonical;
  return raw.trim();
}

// technologiesUsed é um array livre por experiência (não tem @@unique pra
// forçar isso no banco como TalentCompetency) — sem isso, "JS" e
// "Javascript" na mesma experiência viram duas entradas na mesma lista.
function dedupeCanonicalTechLabels(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    if (!value.trim()) continue;
    const label = canonicalTechLabel(value);
    seen.set(normalize(label), label);
  }
  return [...seen.values()];
}

function parseYear(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d{4}/);
  return match ? Number.parseInt(match[0], 10) : null;
}

// Datas do CV vêm em formatos livres ("Jan 2022", "2022-01", "2022") — só
// tenta reconhecer ano+mês numérico ou só ano; qualquer outra coisa vira
// null em vez de uma Date incorreta.
function parseLooseDate(value: string | null): Date | null {
  if (!value) return null;
  const isoMatch = value.match(/(\d{4})-(\d{2})/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, 1);
  }
  const yearOnly = value.match(/^\d{4}$/);
  if (yearOnly) {
    return new Date(Number(yearOnly[0]), 0, 1);
  }
  return null;
}

export type MappedCompetency = {
  category: TalentCompetencyCategory;
  valueNormalized: string;
  valueLabel: string;
};

export type MappedLanguage = {
  language: string;
  proficiencyLevel: string | null;
};

export type MappedCertification = {
  name: string;
  nameNormalized: string;
  issuer: string | null;
  year: number | null;
};

export type MappedExperience = {
  company: string;
  companyNormalized: string;
  role: string;
  roleNormalized: string;
  location: string | null;
  startDate: Date | null;
  endDate: Date | null;
  isCurrent: boolean;
  technologiesUsed: string[];
  bulletsJson: string[];
};

export type MappedEducation = {
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

export type MappedProfileCache = {
  fullName?: string;
  primaryEmail?: string;
  phone?: string;
  linkedinUrl?: string;
  city?: string;
  state?: string;
  country?: string;
  currentTitle?: string;
  seniority?: SeniorityLevel;
  primaryAreas?: JobArea[];
};

export function mapCompetencies(profile: CanonicalProfile): MappedCompetency[] {
  const skills = profile.skills
    .filter((skill) => skill.trim().length > 0)
    .map((skill) => {
      const label = canonicalTechLabel(skill);
      return {
        category: "TECHNICAL_SKILL" as TalentCompetencyCategory,
        valueNormalized: normalize(label),
        valueLabel: label,
      };
    });

  const dedup = new Map<string, MappedCompetency>();
  for (const skill of skills) {
    dedup.set(`${skill.category}:${skill.valueNormalized}`, skill);
  }
  return [...dedup.values()];
}

export function mapLanguages(profile: CanonicalProfile): MappedLanguage[] {
  const languages = profile.languages
    .filter((entry) => entry.language.trim().length > 0)
    .map((entry) => ({
      language: canonicalLanguageLabel(entry.language),
      proficiencyLevel: entry.level,
    }));

  const dedup = new Map<string, MappedLanguage>();
  for (const language of languages) {
    dedup.set(language.language, language);
  }
  return [...dedup.values()];
}

export function mapCertifications(
  profile: CanonicalProfile,
): MappedCertification[] {
  return profile.certifications
    .filter((entry) => entry.name.trim().length > 0)
    .map((entry) => ({
      name: entry.name.trim(),
      nameNormalized: normalize(entry.name),
      issuer: entry.issuer,
      year: parseYear(entry.year),
    }));
}

export function mapExperiences(profile: CanonicalProfile): MappedExperience[] {
  return profile.experiences
    .filter((entry) => entry.company && entry.role)
    .map((entry) => ({
      company: entry.company as string,
      companyNormalized: normalize(entry.company as string),
      role: entry.role as string,
      roleNormalized: normalize(entry.role as string),
      location: entry.location,
      startDate: parseLooseDate(entry.startDate),
      endDate: parseLooseDate(entry.endDate),
      isCurrent: /presente|atual|current|now/i.test(entry.endDate ?? ""),
      technologiesUsed: dedupeCanonicalTechLabels(entry.technologies),
      bulletsJson: entry.bullets,
    }));
}

export function mapEducation(profile: CanonicalProfile): MappedEducation[] {
  return profile.education
    .filter((entry) => entry.institution)
    .map((entry) => ({
      institution: entry.institution as string,
      degree: entry.degree,
      fieldOfStudy: entry.fieldOfStudy,
      startDate: parseLooseDate(entry.startDate),
      endDate: parseLooseDate(entry.endDate),
    }));
}

// Só devolve os campos que a IA de fato preencheu — o chamador decide a
// política de "não sobrescrever dado melhor" (ver seedProfileCache/
// upgradeProfileCache nos scripts).
export function mapProfileCache(profile: CanonicalProfile): MappedProfileCache {
  const cache: MappedProfileCache = {};

  if (profile.fullName) cache.fullName = profile.fullName;
  if (profile.email) cache.primaryEmail = normalize(profile.email);
  if (profile.phone) cache.phone = profile.phone;
  if (profile.linkedinUrl) cache.linkedinUrl = profile.linkedinUrl;
  if (profile.location.city) cache.city = profile.location.city;
  if (profile.location.state) cache.state = profile.location.state;
  if (profile.location.country) cache.country = profile.location.country;
  if (profile.headline) cache.currentTitle = profile.headline;

  const seniority = RADAR_SENIORITY_TO_TALENT[profile.radarProfile.seniority];
  if (seniority && seniority !== "UNKNOWN") cache.seniority = seniority;

  const areas = profile.radarProfile.areas.filter((area) =>
    VALID_JOB_AREAS.has(area),
  ) as JobArea[];
  if (areas.length > 0) cache.primaryAreas = areas;

  return cache;
}
