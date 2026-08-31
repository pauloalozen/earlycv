import assert from "node:assert/strict";
import { test } from "node:test";

import { SavedJobsService } from "./saved-jobs.service";

const SavedJobsServiceCtor = SavedJobsService as unknown as new (
  db: unknown,
  matchingEngine?: unknown,
  userRadarProfileService?: unknown,
  jobApplicationsService?: unknown,
  funnelEvents?: unknown,
) => SavedJobsService;

const NO_RADAR_PROFILE = { getProfile: async () => null };
const NO_BEST_SCORES = { getBestScoresByJobIds: async () => new Map() };
const NOOP_FUNNEL_EVENTS = {
  record: async () => ({ event: null, ingested: true }),
};

function buildJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    canonicalKey: "job-1",
    company: { name: "Acme", websiteUrl: null },
    country: "BR",
    descriptionClean: "desc",
    descriptionRaw: "<p>desc</p>",
    employmentType: null,
    firstSeenAt: new Date("2026-08-01T00:00:00Z"),
    lastSeenAt: new Date("2026-08-01T00:00:00Z"),
    locationText: "Brasil",
    publishedAtSource: null,
    seniorityLevel: null,
    sourceJobUrl: "https://example.com/job",
    status: "active",
    title: "Vaga",
    workModel: "remote",
    ...overrides,
  };
}

test("save is idempotent via upsert on userId_jobId, defaulting origin to RADAR", async () => {
  let capturedArgs: unknown;
  const db = {
    savedJob: {
      findUnique: async () => null,
      upsert: async (args: unknown) => {
        capturedArgs = args;
        return { id: "saved-1" };
      },
    },
  };
  const service = new SavedJobsServiceCtor(
    db,
    undefined,
    undefined,
    undefined,
    NOOP_FUNNEL_EVENTS,
  );

  await service.save("user-1", "job-1");

  assert.deepEqual(capturedArgs, {
    where: { userId_jobId: { userId: "user-1", jobId: "job-1" } },
    update: {},
    create: { userId: "user-1", jobId: "job-1", origin: "RADAR" },
  });
});

test("save records monitor_recommendation_saved only when origin=MONITOR and the row is actually created (never on a repeat save)", async () => {
  let existingRow: { id: string } | null = null;
  const recordedEvents: string[] = [];
  const db = {
    savedJob: {
      findUnique: async () => existingRow,
      upsert: async () => {
        existingRow = { id: "saved-1" };
        return existingRow;
      },
    },
  };
  const funnelEvents = {
    record: async (input: { eventName: string }) => {
      recordedEvents.push(input.eventName);
      return { event: null, ingested: true };
    },
  };
  const service = new SavedJobsServiceCtor(
    db,
    undefined,
    undefined,
    undefined,
    funnelEvents,
  );

  await service.save("user-1", "job-1", "MONITOR" as never);
  assert.deepEqual(recordedEvents, ["monitor_recommendation_saved"]);

  // Segunda chamada: já existe (findUnique não é mais null) — não deve
  // emitir de novo.
  await service.save("user-1", "job-1", "MONITOR" as never);
  assert.deepEqual(recordedEvents, ["monitor_recommendation_saved"]);
});

test("save never records monitor_recommendation_saved for origin=RADAR (Radar has no canonical 'saved' event)", async () => {
  const recordedEvents: string[] = [];
  const db = {
    savedJob: {
      findUnique: async () => null,
      upsert: async () => ({ id: "saved-1" }),
    },
  };
  const funnelEvents = {
    record: async (input: { eventName: string }) => {
      recordedEvents.push(input.eventName);
      return { event: null, ingested: true };
    },
  };
  const service = new SavedJobsServiceCtor(
    db,
    undefined,
    undefined,
    undefined,
    funnelEvents,
  );

  await service.save("user-1", "job-1");

  assert.deepEqual(recordedEvents, []);
});

test("unsave deletes by userId+jobId", async () => {
  let capturedWhere: unknown;
  const db = {
    savedJob: {
      deleteMany: async ({ where }: { where: unknown }) => {
        capturedWhere = where;
        return { count: 1 };
      },
    },
  };
  const service = new SavedJobsServiceCtor(db);

  await service.unsave("user-1", "job-1");

  assert.deepEqual(capturedWhere, { userId: "user-1", jobId: "job-1" });
});

test("list maps saved jobs to public job view with savedJobId/savedAt", async () => {
  const db = {
    savedJob: {
      findMany: async () => [
        {
          id: "saved-1",
          jobId: "job-1",
          createdAt: new Date("2026-08-01T12:00:00Z"),
          job: { ...buildJobRow(), enrichment: null },
        },
      ],
      count: async () => 1,
    },
  };
  const service = new SavedJobsServiceCtor(
    db,
    {},
    NO_RADAR_PROFILE,
    NO_BEST_SCORES,
  );

  const result = await service.list("user-1", 1, 20);

  assert.equal(result.total, 1);
  assert.equal(result.items[0].savedJobId, "saved-1");
  assert.equal(result.items[0].savedAt, "2026-08-01T12:00:00.000Z");
  assert.equal(result.items[0].job.id, "job-1");
  assert.equal(result.items[0].job.company, "Acme");
  assert.equal(result.items[0].job.isSaved, true);
  assert.equal(result.items[0].job.score, null);
  assert.equal(result.items[0].job.existingApplication, null);
});

test("list defaults to date_desc and orders ascending when sort=date_asc is passed", async () => {
  let capturedOrderBy: unknown;
  const db = {
    savedJob: {
      findMany: async ({ orderBy }: { orderBy: unknown }) => {
        capturedOrderBy = orderBy;
        return [];
      },
      count: async () => 0,
    },
  };
  const service = new SavedJobsServiceCtor(
    db,
    {},
    NO_RADAR_PROFILE,
    NO_BEST_SCORES,
  );

  await service.list("user-1", 1, 20);
  assert.deepEqual(capturedOrderBy, { createdAt: "desc" });

  await service.list("user-1", 1, 20, "date_asc");
  assert.deepEqual(capturedOrderBy, { createdAt: "asc" });

  await service.list("user-1", 1, 20, "date_desc");
  assert.deepEqual(capturedOrderBy, { createdAt: "desc" });
});

test("list computes Radar score and existingApplication when profile/enrichment/analysis are available", async () => {
  const db = {
    savedJob: {
      findMany: async () => [
        {
          id: "saved-1",
          jobId: "job-1",
          createdAt: new Date("2026-08-01T12:00:00Z"),
          job: {
            ...buildJobRow(),
            enrichment: {
              enrichmentStatus: "COMPLETED",
              dominantArea: "DATA_AI",
              areas: ["DATA_AI"],
              requiredSkills: ["python"],
              technologies: ["python"],
              seniority: "SENIOR",
              languageRequirements: [],
            },
          },
        },
      ],
      count: async () => 1,
    },
  };
  const matchingEngine = {
    calculateScore: () => ({
      jobId: "job-1",
      score: 82,
      breakdown: {
        area: 25,
        skills: 30,
        seniority: 20,
        technologies: 15,
        language: 5,
        workModel: 5,
      },
      matchedSkills: ["python"],
      missingSkills: [],
    }),
  };
  const userRadarProfileService = {
    getProfile: async () => ({
      areas: ["DATA_AI"],
      skills: ["python"],
      technologies: ["python"],
      seniority: "SENIOR",
      languages: [],
      preferredWorkModels: [],
    }),
  };
  const jobApplicationsService = {
    getBestScoresByJobIds: async () =>
      new Map([
        [
          "job-1",
          { applicationId: "app-1", status: "ANALYZED", bestScore: 90 },
        ],
      ]),
  };
  const service = new SavedJobsServiceCtor(
    db,
    matchingEngine,
    userRadarProfileService,
    jobApplicationsService,
  );

  const result = await service.list("user-1", 1, 20);

  assert.equal(result.items[0].job.score, 82);
  assert.deepEqual(result.items[0].job.existingApplication, {
    id: "app-1",
    status: "ANALYZED",
    bestScore: 90,
  });
});

test("listSavedJobIds returns a set of jobIds the user saved, empty set for empty input", async () => {
  let capturedWhere: unknown;
  const db = {
    savedJob: {
      findMany: async ({ where }: { where: unknown }) => {
        capturedWhere = where;
        return [{ jobId: "job-1" }, { jobId: "job-2" }];
      },
    },
  };
  const service = new SavedJobsServiceCtor(db);

  const result = await service.listSavedJobIds("user-1", [
    "job-1",
    "job-2",
    "job-3",
  ]);

  assert.deepEqual(capturedWhere, {
    userId: "user-1",
    jobId: { in: ["job-1", "job-2", "job-3"] },
  });
  assert.deepEqual([...result].sort(), ["job-1", "job-2"]);

  const empty = await service.listSavedJobIds("user-1", []);
  assert.equal(empty.size, 0);
});
