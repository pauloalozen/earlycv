import assert from "node:assert/strict";
import { test } from "node:test";

import { MatchingEngine, type ScorableJob, type ScorableProfile } from "./matching.engine";

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    areas: ["SOFTWARE_ENGINEERING"],
    seniority: "SENIOR",
    skills: [],
    technologies: [],
    languages: [],
    certifications: [],
    careerFingerprint: [],
    preferredWorkModels: [],
    preferredContractTypes: [],
    ...overrides,
  };
}

function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    id: `job-${Math.random()}`,
    status: "active",
    workModel: "remote",
    enrichment: {
      enrichmentStatus: "COMPLETED",
      dominantArea: "SOFTWARE_ENGINEERING",
      areas: ["SOFTWARE_ENGINEERING"],
      seniority: "SENIOR",
      contractType: "UNKNOWN",
      ...overrides,
    },
  };
}

function buildEngine(jobs: Array<ReturnType<typeof buildJob>>, profile: unknown) {
  return new MatchingEngine({
    userRadarProfile: { findUnique: async () => profile },
    job: {
      findMany: async () => jobs,
    },
  } as never);
}

test("filterCompatibleJobs excludes jobs with dominantArea OTHER", async () => {
  const profile = buildProfile();
  const compatible = buildJob({ dominantArea: "SOFTWARE_ENGINEERING" });
  // dominantArea=OTHER nunca deveria ser retornado pelo findMany real (o
  // where já filtra no banco), mas simulamos um item vazando pra garantir
  // que o filtro em memória também não deixa passar.
  const other = buildJob({ dominantArea: "OTHER", areas: ["OTHER"] });

  const engine = buildEngine([compatible, other], profile);
  const result = await engine.filterCompatibleJobs({ userId: "user-1" });

  assert.deepEqual(result, [compatible.id]);
});

test("filterCompatibleJobs excludes jobs by incompatible workModel", async () => {
  const profile = buildProfile({ preferredWorkModels: ["remote"] });
  const remoteJob = buildJob();
  remoteJob.workModel = "remote";
  const onsiteJob = buildJob();
  onsiteJob.workModel = "on-site";

  const engine = buildEngine([remoteJob, onsiteJob], profile);
  const result = await engine.filterCompatibleJobs({ userId: "user-1" });

  assert.deepEqual(result, [remoteJob.id]);
});

test("filterCompatibleJobs applies seniority compatibility window (JUNIOR sees JUNIOR/MID, not SENIOR)", async () => {
  const profile = buildProfile({ seniority: "JUNIOR", areas: [] });
  const juniorJob = buildJob({ seniority: "JUNIOR" });
  const midJob = buildJob({ seniority: "MID" });
  const seniorJob = buildJob({ seniority: "SENIOR" });

  const engine = buildEngine([juniorJob, midJob, seniorJob], profile);
  const result = await engine.filterCompatibleJobs({ userId: "user-1" });

  assert.deepEqual(result.sort(), [juniorJob.id, midJob.id].sort());
});

test("filterCompatibleJobs returns empty array when the user has no UserRadarProfile", async () => {
  const engine = buildEngine([buildJob()], null);
  const result = await engine.filterCompatibleJobs({ userId: "user-without-radar" });
  assert.deepEqual(result, []);
});

function buildScorableJob(overrides: Partial<ScorableJob> = {}): ScorableJob {
  return {
    jobId: "job-1",
    workModel: "remote",
    dominantArea: "SOFTWARE_ENGINEERING" as never,
    areas: ["SOFTWARE_ENGINEERING"] as never,
    requiredSkills: ["Python", "SQL"],
    technologies: ["Python", "SQL"],
    seniority: "SENIOR" as never,
    languageRequirements: ["português"],
    ...overrides,
  };
}

function buildScorableProfile(
  overrides: Partial<ScorableProfile> = {},
): ScorableProfile {
  return {
    areas: ["SOFTWARE_ENGINEERING"] as never,
    skills: ["python", "sql"],
    technologies: ["python", "sql"],
    seniority: "SENIOR" as never,
    languages: ["português"],
    preferredWorkModels: ["remote"],
    ...overrides,
  };
}

test("calculateScore returns 100 for a perfect match", () => {
  const engine = new MatchingEngine({} as never);
  const result = engine.calculateScore(buildScorableJob(), buildScorableProfile());

  assert.equal(result.score, 100);
  assert.deepEqual(result.breakdown, {
    area: 25,
    skills: 30,
    seniority: 20,
    technologies: 15,
    language: 5,
    workModel: 5,
  });
  assert.deepEqual(result.matchedSkills, ["Python", "SQL"]);
  assert.deepEqual(result.missingSkills, []);
});

test("calculateScore returns 0 skills points when no required skill matches the profile", () => {
  const engine = new MatchingEngine({} as never);
  const result = engine.calculateScore(
    buildScorableJob({ requiredSkills: ["Kubernetes", "Terraform"] }),
    buildScorableProfile({ skills: ["python", "sql"] }),
  );

  assert.equal(result.breakdown.skills, 0);
  assert.deepEqual(result.matchedSkills, []);
  assert.deepEqual(result.missingSkills, ["Kubernetes", "Terraform"]);
});

test("calculateScore breakdown is correct per dimension for a partial match", () => {
  const engine = new MatchingEngine({} as never);
  const result = engine.calculateScore(
    buildScorableJob({
      dominantArea: "DATA_AI" as never,
      areas: ["DATA_AI", "SOFTWARE_ENGINEERING"] as never,
      requiredSkills: ["Python", "SQL", "Airflow", "Spark"],
      technologies: ["Python", "SQL", "Airflow", "Spark"],
      seniority: "LEAD" as never,
      languageRequirements: ["português", "inglês"],
      workModel: "hybrid",
    }),
    buildScorableProfile({
      areas: ["SOFTWARE_ENGINEERING"] as never,
      skills: ["python", "sql"],
      technologies: ["python", "sql"],
      seniority: "SENIOR" as never,
      languages: ["português"],
      preferredWorkModels: ["remote"],
    }),
  );

  // area: nao e dominante, mas ha intersecao (SOFTWARE_ENGINEERING) -> 15
  assert.equal(result.breakdown.area, 15);
  // skills: 2 de 4 = 50% -> 15
  assert.equal(result.breakdown.skills, 15);
  // technologies: 2 de 4 = 50% -> 8 (Math.round(15 * 0.5) = 8)
  assert.equal(result.breakdown.technologies, 8);
  // seniority: SENIOR vs LEAD = 1 nivel de distancia -> 12
  assert.equal(result.breakdown.seniority, 12);
  // language: so 1 dos 2 requeridos -> parcial -> 2
  assert.equal(result.breakdown.language, 2);
  // workModel: hybrid nao esta em preferredWorkModels=[remote] -> 0
  assert.equal(result.breakdown.workModel, 0);
});

test("calculateScore treats empty language/workModel requirements as trivially satisfied, but NOT empty skills/technologies", () => {
  const engine = new MatchingEngine({} as never);
  const result = engine.calculateScore(
    buildScorableJob({
      requiredSkills: [],
      technologies: [],
      languageRequirements: [],
      workModel: "on-site",
    }),
    buildScorableProfile({ skills: [], technologies: [], preferredWorkModels: [] }),
  );

  // requiredSkills/technologies vazios quase sempre significam "enrichment
  // não extraiu nada" (dominantArea=OTHER, dado insuficiente), não "vaga
  // não exige skill nenhuma" — por isso NÃO é tratado como match trivial
  // (ver comentário em matchPercentage). language/workModel continuam
  // trivialmente satisfeitos quando vazios (ausência de requisito/
  // preferência é, de fato, "compatível com qualquer coisa").
  assert.equal(result.breakdown.skills, 0);
  assert.equal(result.breakdown.technologies, 0);
  assert.equal(result.breakdown.language, 5);
  assert.equal(result.breakdown.workModel, 5);
});

test("calculateScore does not let an unclassified job (dominantArea OTHER, no extracted data) outrank a real match", () => {
  const engine = new MatchingEngine({} as never);
  const profile = buildScorableProfile({
    areas: ["DATA_AI"] as never,
    skills: ["python", "sql", "machine learning"],
    technologies: ["python", "sql"],
    seniority: "MANAGER" as never,
    preferredWorkModels: [],
  });

  const unclassifiedJob = engine.calculateScore(
    buildScorableJob({
      dominantArea: "OTHER" as never,
      areas: [] as never,
      requiredSkills: [],
      technologies: [],
      seniority: "UNKNOWN" as never,
      languageRequirements: [],
    }),
    profile,
  );

  const realMatchJob = engine.calculateScore(
    buildScorableJob({
      dominantArea: "DATA_AI" as never,
      areas: ["DATA_AI"] as never,
      requiredSkills: ["Python", "SQL", "Machine Learning", "Airflow"],
      technologies: ["Python", "SQL"],
      seniority: "SENIOR" as never,
      languageRequirements: [],
    }),
    profile,
  );

  assert.ok(
    realMatchJob.score > unclassifiedJob.score,
    `expected real match (${realMatchJob.score}) to outrank unclassified job (${unclassifiedJob.score})`,
  );
});
