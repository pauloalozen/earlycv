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

function normalize(value: string): string {
  return value.trim().toLowerCase();
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
    .map((skill) => ({
      category: "TECHNICAL_SKILL" as TalentCompetencyCategory,
      valueNormalized: normalize(skill),
      valueLabel: skill.trim(),
    }));

  const dedup = new Map<string, MappedCompetency>();
  for (const skill of skills) {
    dedup.set(`${skill.category}:${skill.valueNormalized}`, skill);
  }
  return [...dedup.values()];
}

export function mapLanguages(profile: CanonicalProfile): MappedLanguage[] {
  return profile.languages
    .filter((entry) => entry.language.trim().length > 0)
    .map((entry) => ({
      language: entry.language.trim(),
      proficiencyLevel: entry.level,
    }));
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
      technologiesUsed: entry.technologies,
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
