import assert from "node:assert/strict";
import { test } from "node:test";

import { MatchingEngine } from "../radar/matching.engine";
import { PublicJobsController } from "./public-jobs.controller";

function buildJob(overrides: Record<string, unknown> = {}) {
  const base = {
    id: "job-1",
    canonicalKey: "job-1",
    company: { name: "Acme", websiteUrl: null },
    country: "BR",
    descriptionClean: "desc",
    descriptionRaw: "<p>desc</p>",
    employmentType: null,
    firstSeenAt: new Date("2026-07-01T00:00:00Z"),
    lastSeenAt: new Date("2026-07-01T00:00:00Z"),
    locationText: "Brasil",
    publishedAtSource: null,
    seniorityLevel: null,
    sourceJobUrl: "https://example.com/job",
    status: "active",
    title: "Vaga",
    workModel: "remote",
    enrichment: {
      enrichmentStatus: "COMPLETED",
      dominantArea: "DATA_AI",
      areas: ["DATA_AI"],
      requiredSkills: ["python", "sql"],
      technologies: ["python", "sql"],
      seniority: "SENIOR",
      languageRequirements: [],
    },
    ...overrides,
  };
  return base;
}

const PROFILE = {
  areas: ["DATA_AI"],
  seniority: "SENIOR",
  skills: ["python", "sql"],
  technologies: ["python", "sql"],
  languages: [],
  preferredWorkModels: [],
};

function buildController(
  jobs: ReturnType<typeof buildJob>[],
  profile: unknown,
  bestScores: Map<string, unknown> = new Map(),
) {
  const jobsService = {
    listByIdsWithEnrichment: async () => jobs,
  };
  const userRadarProfileService = {
    getProfile: async () => profile,
  };
  const matchingEngine = new MatchingEngine({} as never);
  const jobApplicationsService = {
    getBestScoresByJobIds: async () => bestScores,
  };
  const savedJobsService = {
    listSavedJobIds: async () => new Set<string>(),
  };

  return new PublicJobsController(
    jobsService as never,
    userRadarProfileService as never,
    matchingEngine,
    jobApplicationsService as never,
    savedJobsService as never,
  );
}

const USER = { id: "user-1" } as never;

test("list without minScore/minSkillsPct never hides jobs (default Radar behavior)", async () => {
  const highJob = buildJob({ id: "high" });
  const lowJob = buildJob({
    id: "low",
    enrichment: {
      enrichmentStatus: "COMPLETED",
      dominantArea: "OTHER",
      areas: [],
      requiredSkills: [],
      technologies: [],
      seniority: null,
      languageRequirements: [],
    },
  });
  const controller = buildController([highJob, lowJob], PROFILE);

  const result = await controller.list(undefined as never, USER);

  assert.equal(result.total, 2);
  assert.equal(result.data.length, 2);
});

test("list applies minScore filter only when explicitly provided", async () => {
  const highJob = buildJob({ id: "high" });
  const lowJob = buildJob({
    id: "low",
    enrichment: {
      enrichmentStatus: "COMPLETED",
      dominantArea: "OTHER",
      areas: [],
      requiredSkills: [],
      technologies: [],
      seniority: null,
      languageRequirements: [],
    },
  });
  const controller = buildController([highJob, lowJob], PROFILE);

  const result = await controller.list(
    undefined as never, // _request
    USER, // user
    undefined, // q
    undefined, // workModel
    undefined, // seniorityLevel
    undefined, // companyName
    undefined, // publishedWithin
    undefined, // page
    undefined, // limit
    "70", // minScore
  );

  assert.equal(result.total, 1);
  assert.equal(result.data[0]?.id, "high");
  // highCompatCount reflete o conjunto completo, não o filtrado.
  assert.equal(result.highCompatCount, 1);
});

test("list applies minSkillsPct filter based on matchedSkills ratio, not the bucketed breakdown score", async () => {
  const fullMatch = buildJob({ id: "full-match" });
  const partialMatch = buildJob({
    id: "partial-match",
    enrichment: {
      enrichmentStatus: "COMPLETED",
      dominantArea: "DATA_AI",
      areas: ["DATA_AI"],
      requiredSkills: ["python", "sql", "airflow", "spark"],
      technologies: [],
      seniority: "SENIOR",
      languageRequirements: [],
    },
  });
  const controller = buildController([fullMatch, partialMatch], PROFILE);

  const result = await controller.list(
    undefined as never, // _request
    USER, // user
    undefined, // q
    undefined, // workModel
    undefined, // seniorityLevel
    undefined, // companyName
    undefined, // publishedWithin
    undefined, // page
    undefined, // limit
    undefined, // minScore
    "80", // minSkillsPct
  );

  assert.equal(result.total, 1);
  assert.equal(result.data[0]?.id, "full-match");
});

test("list sorts by score DESC by default, and supports score_asc/date_desc/date_asc", async () => {
  const olderHighScore = buildJob({
    id: "older-high-score",
    lastSeenAt: new Date("2026-07-01T00:00:00Z"),
  });
  const newerLowScore = buildJob({
    id: "newer-low-score",
    lastSeenAt: new Date("2026-07-05T00:00:00Z"),
    enrichment: {
      enrichmentStatus: "COMPLETED",
      dominantArea: "DATA_AI",
      areas: ["DATA_AI"],
      requiredSkills: ["python", "sql", "airflow", "spark"],
      technologies: [],
      seniority: "SENIOR",
      languageRequirements: [],
    },
  });
  const controller = buildController([olderHighScore, newerLowScore], PROFILE);

  async function listWithSort(sort: string | undefined) {
    const result = await controller.list(
      undefined as never, // _request
      USER, // user
      undefined, // q
      undefined, // workModel
      undefined, // seniorityLevel
      undefined, // companyName
      undefined, // publishedWithin
      undefined, // page
      undefined, // limit
      undefined, // minScore
      undefined, // minSkillsPct
      sort,
    );
    return result.data.map((item) => item.id);
  }

  assert.deepEqual(await listWithSort(undefined), [
    "older-high-score",
    "newer-low-score",
  ]);
  assert.deepEqual(await listWithSort("score_desc"), [
    "older-high-score",
    "newer-low-score",
  ]);
  assert.deepEqual(await listWithSort("score_asc"), [
    "newer-low-score",
    "older-high-score",
  ]);
  assert.deepEqual(await listWithSort("date_desc"), [
    "newer-low-score",
    "older-high-score",
  ]);
  assert.deepEqual(await listWithSort("date_asc"), [
    "older-high-score",
    "newer-low-score",
  ]);
});

test("list includes breakdown/matchedSkills/missingSkills per item", async () => {
  const controller = buildController([buildJob()], PROFILE);
  const result = await controller.list(undefined as never, USER);

  const item = result.data[0] as {
    score: number | null;
    breakdown: Record<string, number> | null;
    matchedSkills: string[];
    missingSkills: string[];
  };
  assert.equal(typeof item.score, "number");
  assert.ok(item.breakdown);
  assert.deepEqual(item.matchedSkills.sort(), ["python", "sql"]);
  assert.deepEqual(item.missingSkills, []);
});

test("list attaches existingApplication for jobs already analyzed, null otherwise", async () => {
  const analyzedJob = buildJob({ id: "analyzed" });
  const freshJob = buildJob({ id: "fresh" });
  const bestScores = new Map([
    ["analyzed", { applicationId: "app-1", status: "ANALYZED", bestScore: 88 }],
  ]);
  const controller = buildController(
    [analyzedJob, freshJob],
    PROFILE,
    bestScores,
  );

  const result = await controller.list(undefined as never, USER);

  const byId = Object.fromEntries(
    result.data.map((item) => [item.id, item.existingApplication]),
  );
  assert.deepEqual(byId.analyzed, {
    id: "app-1",
    status: "ANALYZED",
    bestScore: 88,
  });
  assert.equal(byId.fresh, null);
});

test("list excludeAnalyzed=true removes already-analyzed jobs from total/pagination, false (default) keeps them", async () => {
  const analyzedJob = buildJob({ id: "analyzed" });
  const freshJob = buildJob({ id: "fresh" });
  const bestScores = new Map([
    ["analyzed", { applicationId: "app-1", status: "ANALYZED", bestScore: 88 }],
  ]);
  const controller = buildController(
    [analyzedJob, freshJob],
    PROFILE,
    bestScores,
  );

  const withoutFilter = await controller.list(
    undefined as never,
    USER,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  );
  assert.equal(withoutFilter.total, 2);
  assert.deepEqual(withoutFilter.data.map((j) => j.id).sort(), [
    "analyzed",
    "fresh",
  ]);

  const withFilter = await controller.list(
    undefined as never,
    USER,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    "true",
  );
  assert.equal(withFilter.total, 1);
  assert.deepEqual(
    withFilter.data.map((j) => j.id),
    ["fresh"],
  );
});

test("list falls back to unpersonalized listing when user has no UserRadarProfile", async () => {
  const jobsService = {
    listByIdsWithEnrichment: async () => {
      throw new Error("should not be called for anonymous/no-profile path");
    },
    listPublicFiltered: async () => ({
      jobs: [buildJob()],
      total: 1,
    }),
  };
  const userRadarProfileService = { getProfile: async () => null };
  const matchingEngine = new MatchingEngine({} as never);
  const savedJobsService = { listSavedJobIds: async () => new Set<string>() };
  const controller = new PublicJobsController(
    jobsService as never,
    userRadarProfileService as never,
    matchingEngine,
    undefined as never,
    savedJobsService as never,
  );

  const result = await controller.list(undefined as never, USER);

  assert.equal(result.total, 1);
  assert.equal((result.data[0] as { score?: unknown }).score, undefined);
  assert.equal(result.highCompatCount, undefined);
});
