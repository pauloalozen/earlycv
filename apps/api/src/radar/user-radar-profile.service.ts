import { Inject, Injectable } from "@nestjs/common";
import { JobArea, type Prisma, SeniorityLevel } from "@prisma/client";

import { DatabaseService } from "../database/database.service";

type SkillsBucketJson = {
  technical?: unknown;
  business?: unknown;
  soft?: unknown;
};

type ExperienceJson = {
  role?: unknown;
  startDate?: unknown;
  endDate?: unknown;
};

const PT_MONTHS: Record<string, number> = {
  jan: 0,
  fev: 1,
  mar: 2,
  abr: 3,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  out: 9,
  nov: 10,
  dez: 11,
};

const AREA_KEYWORDS: Record<JobArea, string[]> = {
  [JobArea.DATA_AI]: [
    "python",
    "sql",
    "pandas",
    "spark",
    "databricks",
    "power bi",
    "tableau",
    "data",
    "bi",
    "machine learning",
    "llm",
    "etl",
  ],
  [JobArea.SOFTWARE_ENGINEERING]: [
    "java",
    "javascript",
    "typescript",
    "react",
    "node",
    "spring",
    "backend",
    "frontend",
    "fullstack",
    "api",
    "rest",
  ],
  [JobArea.CLOUD_DEVOPS]: [
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "terraform",
    "devops",
    "cloud",
    "linux",
    "ansible",
  ],
  [JobArea.CYBERSECURITY]: [
    "security",
    "pentest",
    "soc",
    "siem",
    "firewall",
    "segurança",
    "criptografia",
  ],
  [JobArea.PRODUCT]: [
    "product",
    "produto",
    "roadmap",
    "discovery",
    "backlog",
    "okr",
  ],
  [JobArea.DESIGN_UX]: [
    "figma",
    "ux",
    "ui",
    "design",
    "prototype",
    "wireframe",
    "usability",
  ],
  [JobArea.QA_TEST]: [
    "qa",
    "quality",
    "selenium",
    "cypress",
    "jest",
    "testing",
    "test",
    "automação de testes",
  ],
  // Sem palavras-chave definidas na spec — nunca inferidas a partir de skills.
  [JobArea.PROJECT_AGILE]: [],
  [JobArea.ARCHITECTURE]: [],
  [JobArea.LEADERSHIP]: [],
  [JobArea.OTHER]: [],
};

const LEADERSHIP_TITLE_KEYWORDS = [
  "lead",
  "head",
  "manager",
  "gerente",
  "diretor",
  "director",
  "staff",
];

@Injectable()
export class UserRadarProfileService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async refresh(userId: string, options?: { sourceResumeId?: string }) {
    const profile = await this.database.userProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      return null;
    }

    const skills = this.normalizeSkills(profile.skillsJson);
    const areas = profile.radarAreas.length
      ? profile.radarAreas
      : this.inferAreasFromSkills(profile.skillsJson);
    const seniority =
      profile.radarSeniority && profile.radarSeniority !== SeniorityLevel.UNKNOWN
        ? profile.radarSeniority
        : this.inferSeniorityFromExperiences(profile.experiencesJson);

    const languages = this.extractLanguages(profile.languagesJson);
    const certifications = this.extractCertifications(
      profile.certificationsJson,
    );
    const preferredWorkModels = profile.remotePreference
      ? [profile.remotePreference]
      : [];

    const generatedAt = new Date();

    return this.database.userRadarProfile.upsert({
      where: { userId },
      create: {
        userId,
        areas,
        seniority,
        skills,
        technologies: [],
        languages,
        certifications,
        careerFingerprint: [],
        preferredWorkModels,
        preferredContractTypes: [],
        openToRelocation: false,
        salaryExpectationMin: null,
        sourceResumeId: options?.sourceResumeId ?? null,
        generatedAt,
      },
      update: {
        areas,
        seniority,
        skills,
        languages,
        certifications,
        preferredWorkModels,
        generatedAt,
        ...(options?.sourceResumeId
          ? { sourceResumeId: options.sourceResumeId }
          : {}),
      },
    });
  }

  inferAreasFromSkills(skillsJson: Prisma.JsonValue): JobArea[] {
    const bucket = this.asRecord(skillsJson) as SkillsBucketJson;
    const all = [
      ...this.asStringArray(bucket.technical),
      ...this.asStringArray(bucket.business),
      ...this.asStringArray(bucket.soft),
    ].map((skill) => skill.toLowerCase());

    const areas = new Set<JobArea>();
    for (const area of Object.values(JobArea)) {
      const keywords = AREA_KEYWORDS[area];
      if (
        keywords.length > 0 &&
        all.some((skill) => keywords.some((keyword) => skill.includes(keyword)))
      ) {
        areas.add(area);
      }
    }

    return areas.size > 0
      ? Array.from(areas)
      : [JobArea.SOFTWARE_ENGINEERING];
  }

  inferSeniorityFromExperiences(
    experiencesJson: Prisma.JsonValue,
  ): SeniorityLevel {
    const experiences = this.asArray(experiencesJson) as ExperienceJson[];
    if (experiences.length === 0) {
      return SeniorityLevel.UNKNOWN;
    }

    const totalYears = experiences.reduce((acc, exp) => {
      const start = this.parseDate(exp.startDate);
      const endRaw = typeof exp.endDate === "string" ? exp.endDate : null;
      const end =
        !endRaw || endRaw.toLowerCase() === "atual" || endRaw.toLowerCase() === "presente"
          ? new Date()
          : this.parseDate(exp.endDate);
      if (!start || !end) {
        return acc;
      }
      return acc + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
    }, 0);

    const roles = experiences.map((exp) =>
      typeof exp.role === "string" ? exp.role.toLowerCase() : "",
    );
    const hasLeadership = roles.some((role) =>
      LEADERSHIP_TITLE_KEYWORDS.some((keyword) => role.includes(keyword)),
    );

    if (hasLeadership && totalYears >= 6) return SeniorityLevel.LEAD;
    if (totalYears >= 10) return SeniorityLevel.SENIOR;
    if (totalYears >= 6) return SeniorityLevel.SENIOR;
    if (totalYears >= 3) return SeniorityLevel.MID;
    if (totalYears >= 1) return SeniorityLevel.JUNIOR;
    return SeniorityLevel.INTERN;
  }

  private normalizeSkills(skillsJson: Prisma.JsonValue): string[] {
    const bucket = this.asRecord(skillsJson) as SkillsBucketJson;
    const all = [
      ...this.asStringArray(bucket.technical),
      ...this.asStringArray(bucket.business),
      ...this.asStringArray(bucket.soft),
    ];

    const normalized = new Map<string, string>();
    for (const skill of all) {
      const trimmed = skill.trim().toLowerCase();
      if (trimmed) {
        normalized.set(trimmed, trimmed);
      }
    }
    return Array.from(normalized.values());
  }

  private extractLanguages(languagesJson: Prisma.JsonValue): string[] {
    const languages = this.asArray(languagesJson) as Array<{
      language?: unknown;
    }>;
    const normalized = new Map<string, string>();
    for (const entry of languages) {
      if (typeof entry.language !== "string") continue;
      const trimmed = entry.language.trim().toLowerCase();
      if (trimmed) {
        normalized.set(trimmed, trimmed);
      }
    }
    return Array.from(normalized.values());
  }

  private extractCertifications(certificationsJson: Prisma.JsonValue): string[] {
    const certifications = this.asArray(certificationsJson) as Array<{
      name?: unknown;
    }>;
    return certifications
      .map((entry) => (typeof entry.name === "string" ? entry.name.trim() : ""))
      .filter((name) => name.length > 0);
  }

  private parseDate(value: unknown): Date | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    // "2022-01" ou "2022-01-15"
    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return new Date(Number(year), Number(month) - 1, Number(day ?? "1"));
    }

    // "06/26" ou "06/2026" (formato MM/AA ou MM/AAAA usado no CV)
    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{2,4})$/);
    if (slashMatch) {
      const [, month, yearRaw] = slashMatch;
      const year =
        yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
      return new Date(year, Number(month) - 1, 1);
    }

    // "2025" (apenas ano)
    const yearMatch = trimmed.match(/^(\d{4})$/);
    if (yearMatch) {
      return new Date(Number(yearMatch[1]), 0, 1);
    }

    // "Março 2026" / "março de 2026" (nomes de mês em português)
    const ptMatch = trimmed
      .toLowerCase()
      .match(/^([a-zçã]+)(?:\s+de)?\s+(\d{4})$/);
    if (ptMatch) {
      const [, monthName, year] = ptMatch;
      const monthIndex = PT_MONTHS[monthName.slice(0, 3)];
      if (monthIndex !== undefined) {
        return new Date(Number(year), monthIndex, 1);
      }
    }

    return null;
  }

  private asRecord(value: Prisma.JsonValue): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private asArray(value: Prisma.JsonValue): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
  }
}
