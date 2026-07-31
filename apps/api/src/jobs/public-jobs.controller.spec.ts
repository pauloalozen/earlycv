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

function buildController(jobs: ReturnType<typeof buildJob>[], profile: unknown) {
  const jobsService = {
    listByIdsWithEnrichment: async () => jobs,
  };
  const userRadarProfileService = {
    getProfile: async () => profile,
  };
  const matchingEngine = new MatchingEngine({} as never);

  return new PublicJobsController(
    jobsService as never,
    userRadarProfileService as never,
    matchingEngine,
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
  const controller = new PublicJobsController(
    jobsService as never,
    userRadarProfileService as never,
    matchingEngine,
  );

  const result = await controller.list(undefined as never, USER);

  assert.equal(result.total, 1);
  assert.equal((result.data[0] as { score?: unknown }).score, undefined);
  assert.equal(result.highCompatCount, undefined);
});
