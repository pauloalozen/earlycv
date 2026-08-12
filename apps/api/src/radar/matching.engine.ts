import { Inject, Injectable } from "@nestjs/common";
import { type ContractType, JobArea, SeniorityLevel } from "@prisma/client";

import { DatabaseService } from "../database/database.service";

export type MatchFilter = {
  userId: string;
  workModel?: string[];
  contractType?: ContractType[];
  seniority?: SeniorityLevel[];
};

export type ScoreBreakdown = {
  area: number;
  skills: number;
  seniority: number;
  technologies: number;
  language: number;
  workModel: number;
};

export type MatchDetailItem = { label: string; ok: boolean };

// Item-a-item por dimensão (área/skills/senioridade/tecnologias) — usado
// pelo card de vaga pra mostrar exatamente quais termos bateram com o
// perfil quando o usuário clica numa barra de composição do score. Só
// cobre as 4 dimensões que o card expõe hoje; language/workModel não têm
// painel clicável (ver Card Vaga - Breakdown Clicavel.html).
export type MatchDetails = {
  area: MatchDetailItem[];
  skills: MatchDetailItem[];
  seniority: MatchDetailItem[];
  technologies: MatchDetailItem[];
};

export type MatchScore = {
  jobId: string;
  score: number;
  breakdown: ScoreBreakdown;
  matchedSkills: string[];
  missingSkills: string[];
  matchDetails: MatchDetails;
};

// Vaga com apenas os campos necessários para o score — evita acoplar
// calculateScore ao shape completo do Prisma (Job + JobEnrichment), o que
// facilita testar com fixtures simples.
export type ScorableJob = {
  jobId: string;
  workModel: string | null;
  dominantArea: JobArea | null;
  areas: JobArea[];
  requiredSkills: string[];
  technologies: string[];
  seniority: SeniorityLevel | null;
  languageRequirements: string[];
};

export type ScorableProfile = {
  areas: JobArea[];
  skills: string[];
  technologies: string[];
  seniority: SeniorityLevel;
  languages: string[];
  preferredWorkModels: string[];
};

// Ordem de senioridade usada para calcular "distância" entre o nível do
// usuário e o da vaga. UNKNOWN fica de fora — tratado à parte (sem dado
// suficiente pra comparar, não elimina e não pontua para baixo).
const SENIORITY_LADDER: SeniorityLevel[] = [
  SeniorityLevel.INTERN,
  SeniorityLevel.JUNIOR,
  SeniorityLevel.MID,
  SeniorityLevel.SENIOR,
  SeniorityLevel.LEAD,
  SeniorityLevel.STAFF,
  SeniorityLevel.MANAGER,
  SeniorityLevel.DIRECTOR,
];

function seniorityDistance(
  a: SeniorityLevel | null,
  b: SeniorityLevel | null,
): number | null {
  if (!a || !b || a === SeniorityLevel.UNKNOWN || b === SeniorityLevel.UNKNOWN) {
    return null;
  }
  const indexA = SENIORITY_LADDER.indexOf(a);
  const indexB = SENIORITY_LADDER.indexOf(b);
  if (indexA === -1 || indexB === -1) {
    return null;
  }
  return Math.abs(indexA - indexB);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedSet(values: string[]): Set<string> {
  return new Set(values.map(normalize));
}

function matchPercentage(
  required: string[],
  available: Set<string>,
): { pct: number; matched: string[]; missing: string[] } {
  // Lista vazia de requiredSkills/technologies quase sempre significa que o
  // enrichment não extraiu nada da vaga (ex: dominantArea=OTHER, dado
  // insuficiente) — não que a vaga genuinamente não exige nenhuma skill.
  // Tratar como "trivialmente satisfeito" (100%) inflava o score de vagas
  // sem classificação real acima de vagas relevantes com requisitos de
  // verdade (achado em teste manual: "Analista de Governança de TI", sem
  // nenhum dado extraído, rankeava acima de "Engenheiro de Dados"). 0% é a
  // leitura honesta: sem dado, sem evidência de match.
  if (required.length === 0) {
    return { pct: 0, matched: [], missing: [] };
  }
  const matched: string[] = [];
  const missing: string[] = [];
  for (const item of required) {
    if (available.has(normalize(item))) {
      matched.push(item);
    } else {
      missing.push(item);
    }
  }
  return { pct: matched.length / required.length, matched, missing };
}

// Bucket por faixa mínima (100/75/50/25/0%), conforme a tabela da spec —
// não é interpolação linear.
function scoreByPercentageBucket(pct: number, max: number): number {
  const buckets: Array<[minPct: number, fraction: number]> = [
    [1, 1],
    [0.75, 0.75],
    [0.5, 0.5],
    [0.25, 0.25],
    [0, 0],
  ];
  for (const [minPct, fraction] of buckets) {
    if (pct >= minPct) {
      return Math.round(max * fraction);
    }
  }
  return 0;
}

@Injectable()
export class MatchingEngine {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async filterCompatibleJobs(filter: MatchFilter): Promise<string[]> {
    const profile = await this.database.userRadarProfile.findUnique({
      where: { userId: filter.userId },
    });
    if (!profile) {
      return [];
    }

    const workModelFilter = filter.workModel ?? profile.preferredWorkModels;
    const contractTypeFilter =
      filter.contractType ?? profile.preferredContractTypes;
    const seniorityFilter = filter.seniority;

    const jobs = await this.database.job.findMany({
      where: {
        status: "active",
        enrichment: {
          enrichmentStatus: "COMPLETED",
          dominantArea: { not: JobArea.OTHER },
          ...(profile.areas.length > 0
            ? { areas: { hasSome: profile.areas } }
            : {}),
        },
        ...(workModelFilter.length > 0
          ? { workModel: { in: workModelFilter } }
          : {}),
      },
      include: { enrichment: true },
    });

    return jobs
      .filter((job) => {
        if (!job.enrichment) {
          return false;
        }

        // Regra 1 e 2 já vão embutidas no `where` acima (via query no
        // banco) — repetidas aqui em memória como defesa extra, já que o
        // restante do filtro (contractType/seniority) precisa rodar em
        // memória de qualquer forma.
        if (
          job.enrichment.enrichmentStatus !== "COMPLETED" ||
          job.enrichment.dominantArea === JobArea.OTHER
        ) {
          return false;
        }
        if (
          profile.areas.length > 0 &&
          !job.enrichment.areas.some((area) => profile.areas.includes(area))
        ) {
          return false;
        }
        if (
          workModelFilter.length > 0 &&
          (!job.workModel || !workModelFilter.includes(job.workModel))
        ) {
          return false;
        }

        if (
          contractTypeFilter.length > 0 &&
          job.enrichment.contractType !== "UNKNOWN" &&
          !contractTypeFilter.includes(
            job.enrichment.contractType as ContractType,
          )
        ) {
          return false;
        }

        if (seniorityFilter && seniorityFilter.length > 0) {
          return (
            job.enrichment.seniority !== null &&
            seniorityFilter.includes(job.enrichment.seniority)
          );
        }

        const distance = seniorityDistance(
          profile.seniority,
          job.enrichment.seniority,
        );
        return distance === null || distance <= 1;
      })
      .map((job) => job.id);
  }

  calculateScore(job: ScorableJob, profile: ScorableProfile): MatchScore {
    const areaScore = this.scoreArea(job, profile);
    const skillsResult = matchPercentage(
      job.requiredSkills,
      normalizedSet(profile.skills),
    );
    const skillsScore = scoreByPercentageBucket(skillsResult.pct, 30);

    const technologiesPool = normalizedSet([
      ...profile.skills,
      ...profile.technologies,
    ]);
    const technologiesResult = matchPercentage(
      job.technologies,
      technologiesPool,
    );
    const technologiesScore = scoreByPercentageBucket(
      technologiesResult.pct,
      15,
    );

    const seniorityScore = this.scoreSeniority(job.seniority, profile.seniority);
    const languageScore = this.scoreLanguage(job, profile);
    const workModelScore = this.scoreWorkModel(job, profile);

    const breakdown: ScoreBreakdown = {
      area: areaScore,
      skills: skillsScore,
      seniority: seniorityScore,
      technologies: technologiesScore,
      language: languageScore,
      workModel: workModelScore,
    };

    const matchDetails: MatchDetails = {
      area: this.buildAreaItems(job, profile),
      skills: [
        ...skillsResult.matched.map((label) => ({ label, ok: true })),
        ...skillsResult.missing.map((label) => ({ label, ok: false })),
      ],
      seniority: this.buildSeniorityItems(job, profile),
      technologies: [
        ...technologiesResult.matched.map((label) => ({ label, ok: true })),
        ...technologiesResult.missing.map((label) => ({ label, ok: false })),
      ],
    };

    return {
      jobId: job.jobId,
      score:
        breakdown.area +
        breakdown.skills +
        breakdown.seniority +
        breakdown.technologies +
        breakdown.language +
        breakdown.workModel,
      breakdown,
      matchedSkills: skillsResult.matched,
      missingSkills: skillsResult.missing,
      matchDetails,
    };
  }

  // dominantArea primeiro (é o que decide a maior parte da pontuação de
  // área), seguido das demais áreas da vaga sem repetir — cada uma marcada
  // "ok" se está entre as áreas escolhidas no perfil do usuário.
  private buildAreaItems(
    job: ScorableJob,
    profile: ScorableProfile,
  ): MatchDetailItem[] {
    const ordered = job.dominantArea
      ? [job.dominantArea, ...job.areas.filter((a) => a !== job.dominantArea)]
      : job.areas;
    return ordered.map((area) => ({
      label: area,
      ok: profile.areas.includes(area),
    }));
  }

  // Um item só: o nível de senioridade que a vaga pede, marcado "ok" quando
  // é exatamente o nível do perfil (distância 0) — mesmo critério usado por
  // scoreSeniority pra atribuir a pontuação máxima dessa dimensão.
  private buildSeniorityItems(
    job: ScorableJob,
    profile: ScorableProfile,
  ): MatchDetailItem[] {
    if (!job.seniority || job.seniority === SeniorityLevel.UNKNOWN) {
      return [];
    }
    return [
      {
        label: job.seniority,
        ok: seniorityDistance(profile.seniority, job.seniority) === 0,
      },
    ];
  }

  private scoreArea(job: ScorableJob, profile: ScorableProfile): number {
    if (profile.areas.length === 0) {
      return 0;
    }
    if (job.dominantArea && profile.areas.includes(job.dominantArea)) {
      return 25;
    }
    if (job.areas.some((area) => profile.areas.includes(area))) {
      return 15;
    }
    return 0;
  }

  private scoreSeniority(
    jobSeniority: SeniorityLevel | null,
    profileSeniority: SeniorityLevel,
  ): number {
    const distance = seniorityDistance(profileSeniority, jobSeniority);
    if (distance === null) {
      return 10;
    }
    if (distance === 0) return 20;
    if (distance === 1) return 12;
    if (distance === 2) return 5;
    return 0;
  }

  private scoreLanguage(job: ScorableJob, profile: ScorableProfile): number {
    if (job.languageRequirements.length === 0) {
      return 5;
    }
    const available = normalizedSet(profile.languages);
    const { pct } = matchPercentage(job.languageRequirements, available);
    if (pct >= 1) return 5;
    if (pct > 0) return 2;
    return 0;
  }

  private scoreWorkModel(job: ScorableJob, profile: ScorableProfile): number {
    if (profile.preferredWorkModels.length === 0) {
      return 5;
    }
    if (!job.workModel) {
      return 0;
    }
    return normalizedSet(profile.preferredWorkModels).has(
      normalize(job.workModel),
    )
      ? 5
      : 0;
  }
}
