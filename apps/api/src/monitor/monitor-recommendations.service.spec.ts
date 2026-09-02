import assert from "node:assert/strict";
import { test } from "node:test";

import { MonitorRecommendationsService } from "./monitor-recommendations.service";

const MonitorRecommendationsServiceCtor =
  MonitorRecommendationsService as unknown as new (
    db: unknown,
    jobApplicationsService: unknown,
    savedJobsService: unknown,
    funnelEvents: unknown,
    monitorProfileMatchService: unknown,
    matchingEngine: unknown,
    userRadarProfileService: unknown,
    entitlementService: unknown,
  ) => MonitorRecommendationsService;

const ALLOW_ENTITLEMENT = {
  canUseMonitor: async () => ({ allowed: true, reason: "launch_access" }),
};

const NO_SAVED_JOBS = { listSavedJobIds: async () => new Set<string>() };
const NO_APPLICATIONS = { getBestScoresByJobIds: async () => new Map() };
const NOOP_FUNNEL_EVENTS = {
  record: async () => ({ event: null, ingested: true }),
};
const NOOP_PROFILE_MATCH_SERVICE = {
  ensureMonitorInitialized: async () => {},
};
const NOOP_MATCHING_ENGINE = {
  calculateScore: () => ({
    jobId: "job-1",
    score: 80,
    breakdown: {
      area: 25,
      skills: 25,
      seniority: 25,
      technologies: 15,
      language: 5,
      workModel: 5,
    },
    matchedSkills: [],
    missingSkills: [],
    matchDetails: { area: [], skills: [], seniority: [], technologies: [] },
  }),
};
const NOOP_RADAR_PROFILE_SERVICE = {
  getProfile: async () => null,
};

function buildJobRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    canonicalKey: id,
    company: { name: "Acme", websiteUrl: null, logoUrl: null },
    country: "BR",
    descriptionClean: "desc",
    descriptionRaw: "<p>desc</p>",
    employmentType: null,
    firstSeenAt: new Date("2026-08-01T00:00:00Z"),
    lastSeenAt: new Date("2026-08-01T00:00:00Z"),
    locationText: "Brasil",
    publishedAtSource: null,
    seniorityLevel: null,
    slug: `${id}-slug`,
    sourceJobUrl: "https://example.com/job",
    status: "active",
    title: "Vaga",
    workModel: "remote",
    city: null,
    state: null,
    enrichment: { technologies: [], dominantArea: "SOFTWARE_ENGINEERING" },
    ...overrides,
  };
}

function buildRecommendationRow(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    userId: "user-1",
    jobId: `job-of-${id}`,
    score: 80,
    opportunityLevel: 4,
    recommendedAt: new Date("2026-08-20T00:00:00Z"),
    viewedAt: null,
    dismissedAt: null,
    feedback: null,
    feedbackReason: null,
    ...overrides,
  };
}

function createDb(
  recommendations: Map<string, ReturnType<typeof buildRecommendationRow>>,
  jobs: Map<string, ReturnType<typeof buildJobRow>>,
) {
  return {
    userRadarProfile: {
      findUnique: async () => ({ monitorStatus: "ACTIVE" }),
    },
    userJobRecommendation: {
      findMany: async ({
        where,
      }: {
        where: {
          userId: string;
          dismissedAt?: null;
          opportunityLevel?: number;
        };
      }) => {
        const rows = Array.from(recommendations.values()).filter(
          (r) =>
            r.userId === where.userId &&
            (where.dismissedAt === undefined ||
              r.dismissedAt === where.dismissedAt) &&
            (where.opportunityLevel === undefined ||
              r.opportunityLevel === where.opportunityLevel),
        );
        return rows.map((r) => ({ ...r, job: jobs.get(r.jobId) }));
      },
      count: async ({ where }: { where: Record<string, unknown> }) =>
        Array.from(recommendations.values()).filter((r) => {
          if (r.userId !== where.userId) return false;
          if ("viewedAt" in where && r.viewedAt !== where.viewedAt)
            return false;
          if ("dismissedAt" in where && r.dismissedAt !== where.dismissedAt)
            return false;
          if (
            "opportunityLevel" in where &&
            r.opportunityLevel !== where.opportunityLevel
          )
            return false;
          return true;
        }).length,
      groupBy: async ({
        where,
      }: {
        where: { userId: string; dismissedAt?: null };
      }) => {
        const rows = Array.from(recommendations.values()).filter(
          (r) =>
            r.userId === where.userId &&
            (where.dismissedAt === undefined ||
              r.dismissedAt === where.dismissedAt),
        );
        const counts = new Map<number, number>();
        for (const r of rows) {
          counts.set(
            r.opportunityLevel,
            (counts.get(r.opportunityLevel) ?? 0) + 1,
          );
        }
        return Array.from(counts.entries()).map(
          ([opportunityLevel, count]) => ({
            opportunityLevel,
            _count: { _all: count },
          }),
        );
      },
      findFirst: async ({
        where,
      }: {
        where: { id: string; userId: string };
      }) => {
        const row = recommendations.get(where.id);
        if (!row || row.userId !== where.userId) return null;
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const current = recommendations.get(where.id);
        assert.ok(current, `recommendation ${where.id} must exist`);
        const next = { ...current, ...data };
        recommendations.set(where.id, next);
        return next;
      },
    },
  };
}

test("markViewed sets viewedAt and is idempotent on a second call", async () => {
  const recommendations = new Map([
    ["rec-1", buildRecommendationRow("rec-1", { userId: "user-1" })],
  ]);
  const db = createDb(recommendations, new Map());
  const service = new MonitorRecommendationsServiceCtor(
    db,
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
    NOOP_FUNNEL_EVENTS,
    NOOP_PROFILE_MATCH_SERVICE,
    NOOP_MATCHING_ENGINE,
    NOOP_RADAR_PROFILE_SERVICE,
    ALLOW_ENTITLEMENT,
  );

  const first = await service.markViewed("user-1", "rec-1");
  assert.ok(first.viewedAt instanceof Date);

  const firstViewedAt = first.viewedAt;
  const second = await service.markViewed("user-1", "rec-1");
  assert.equal(
    second.viewedAt,
    firstViewedAt,
    "viewedAt must not change on repeat calls",
  );
});

test("dismiss sets dismissedAt", async () => {
  const recommendations = new Map([
    ["rec-1", buildRecommendationRow("rec-1", { userId: "user-1" })],
  ]);
  const db = createDb(recommendations, new Map());
  const service = new MonitorRecommendationsServiceCtor(
    db,
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
    NOOP_FUNNEL_EVENTS,
    NOOP_PROFILE_MATCH_SERVICE,
    NOOP_MATCHING_ENGINE,
    NOOP_RADAR_PROFILE_SERVICE,
    ALLOW_ENTITLEMENT,
  );

  const updated = await service.dismiss("user-1", "rec-1");
  assert.ok(updated.dismissedAt instanceof Date);
});

test("submitFeedback persists feedback and optional reason", async () => {
  const recommendations = new Map([
    ["rec-1", buildRecommendationRow("rec-1", { userId: "user-1" })],
  ]);
  const db = createDb(recommendations, new Map());
  const service = new MonitorRecommendationsServiceCtor(
    db,
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
    NOOP_FUNNEL_EVENTS,
    NOOP_PROFILE_MATCH_SERVICE,
    NOOP_MATCHING_ENGINE,
    NOOP_RADAR_PROFILE_SERVICE,
    ALLOW_ENTITLEMENT,
  );

  const updated = await service.submitFeedback(
    "user-1",
    "rec-1",
    "NEGATIVE" as never,
    "AREA_MISMATCH" as never,
  );

  assert.equal(updated.feedback, "NEGATIVE");
  assert.equal(updated.feedbackReason, "AREA_MISMATCH");
  assert.ok(updated.feedbackAt instanceof Date);
});

test("countUnviewed only counts recommendations with viewedAt and dismissedAt both null", async () => {
  const recommendations = new Map([
    ["rec-1", buildRecommendationRow("rec-1", { userId: "user-1" })],
    [
      "rec-2",
      buildRecommendationRow("rec-2", {
        userId: "user-1",
        viewedAt: new Date(),
      }),
    ],
    [
      "rec-3",
      buildRecommendationRow("rec-3", {
        userId: "user-1",
        dismissedAt: new Date(),
      }),
    ],
    ["rec-4", buildRecommendationRow("rec-4", { userId: "user-2" })],
  ]);
  const db = createDb(recommendations, new Map());
  const service = new MonitorRecommendationsServiceCtor(
    db,
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
    NOOP_FUNNEL_EVENTS,
    NOOP_PROFILE_MATCH_SERVICE,
    NOOP_MATCHING_ENGINE,
    NOOP_RADAR_PROFILE_SERVICE,
    ALLOW_ENTITLEMENT,
  );

  const result = await service.countUnviewed("user-1");
  assert.equal(result.count, 1);
  assert.equal(result.monitorStatus, "ACTIVE");
});

test("list() enriches each recommendation with isSaved and existingApplication", async () => {
  const recommendations = new Map([
    [
      "rec-1",
      buildRecommendationRow("rec-1", { userId: "user-1", jobId: "job-1" }),
    ],
  ]);
  const jobs = new Map([["job-1", buildJobRow("job-1")]]);
  const db = createDb(recommendations, jobs);

  const savedJobsService = {
    listSavedJobIds: async () => new Set(["job-1"]),
  };
  const jobApplicationsService = {
    getBestScoresByJobIds: async () =>
      new Map([
        ["job-1", { applicationId: "app-1", status: "APPLIED", bestScore: 90 }],
      ]),
  };

  const service = new MonitorRecommendationsServiceCtor(
    db,
    jobApplicationsService,
    savedJobsService,
    NOOP_FUNNEL_EVENTS,
    NOOP_PROFILE_MATCH_SERVICE,
    NOOP_MATCHING_ENGINE,
    NOOP_RADAR_PROFILE_SERVICE,
    ALLOW_ENTITLEMENT,
  );

  const { items } = await service.list("user-1", {});
  assert.equal(items.length, 1);
  assert.equal(items[0].job.isSaved, true);
  assert.deepEqual(items[0].job.existingApplication, {
    id: "app-1",
    status: "APPLIED",
    bestScore: 90,
  });
  assert.equal(items[0].isNew, true);
});

test("a user can never view, dismiss or send feedback on another user's recommendation", async () => {
  const recommendations = new Map([
    ["rec-1", buildRecommendationRow("rec-1", { userId: "user-1" })],
  ]);
  const db = createDb(recommendations, new Map());
  const service = new MonitorRecommendationsServiceCtor(
    db,
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
    NOOP_FUNNEL_EVENTS,
    NOOP_PROFILE_MATCH_SERVICE,
    NOOP_MATCHING_ENGINE,
    NOOP_RADAR_PROFILE_SERVICE,
    ALLOW_ENTITLEMENT,
  );

  await assert.rejects(() => service.markViewed("user-2", "rec-1"));
  await assert.rejects(() => service.dismiss("user-2", "rec-1"));
  await assert.rejects(() =>
    service.submitFeedback("user-2", "rec-1", "POSITIVE" as never),
  );
});

test("list() with opportunityLevel only returns recommendations of that level", async () => {
  const recommendations = new Map([
    [
      "rec-1",
      buildRecommendationRow("rec-1", {
        userId: "user-1",
        jobId: "job-1",
        opportunityLevel: 5,
      }),
    ],
    [
      "rec-2",
      buildRecommendationRow("rec-2", {
        userId: "user-1",
        jobId: "job-2",
        opportunityLevel: 3,
      }),
    ],
  ]);
  const jobs = new Map([
    ["job-1", buildJobRow("job-1")],
    ["job-2", buildJobRow("job-2")],
  ]);
  const db = createDb(recommendations, jobs);
  const service = new MonitorRecommendationsServiceCtor(
    db,
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
    NOOP_FUNNEL_EVENTS,
    NOOP_PROFILE_MATCH_SERVICE,
    NOOP_MATCHING_ENGINE,
    NOOP_RADAR_PROFILE_SERVICE,
    ALLOW_ENTITLEMENT,
  );

  const { items, total } = await service.list("user-1", {
    opportunityLevel: 5,
  });
  assert.equal(total, 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].recommendationId, "rec-1");
});

test("list() with excludeAnalyzed=true drops recommendations whose job already has a score, and total reflects the filtered count", async () => {
  const recommendations = new Map([
    [
      "rec-1",
      buildRecommendationRow("rec-1", { userId: "user-1", jobId: "job-1" }),
    ],
    [
      "rec-2",
      buildRecommendationRow("rec-2", { userId: "user-1", jobId: "job-2" }),
    ],
  ]);
  const jobs = new Map([
    ["job-1", buildJobRow("job-1")],
    ["job-2", buildJobRow("job-2")],
  ]);
  const db = createDb(recommendations, jobs);

  const jobApplicationsService = {
    getBestScoresByJobIds: async () =>
      new Map([
        ["job-1", { applicationId: "app-1", status: "APPLIED", bestScore: 90 }],
      ]),
  };

  const service = new MonitorRecommendationsServiceCtor(
    db,
    jobApplicationsService,
    NO_SAVED_JOBS,
    NOOP_FUNNEL_EVENTS,
    NOOP_PROFILE_MATCH_SERVICE,
    NOOP_MATCHING_ENGINE,
    NOOP_RADAR_PROFILE_SERVICE,
    ALLOW_ENTITLEMENT,
  );

  const { items, total } = await service.list("user-1", {
    excludeAnalyzed: true,
  });
  assert.equal(total, 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].recommendationId, "rec-2");
});

test("list() without excludeAnalyzed keeps recommendations whose job already has a score", async () => {
  const recommendations = new Map([
    [
      "rec-1",
      buildRecommendationRow("rec-1", { userId: "user-1", jobId: "job-1" }),
    ],
    [
      "rec-2",
      buildRecommendationRow("rec-2", { userId: "user-1", jobId: "job-2" }),
    ],
  ]);
  const jobs = new Map([
    ["job-1", buildJobRow("job-1")],
    ["job-2", buildJobRow("job-2")],
  ]);
  const db = createDb(recommendations, jobs);

  const jobApplicationsService = {
    getBestScoresByJobIds: async () =>
      new Map([
        ["job-1", { applicationId: "app-1", status: "APPLIED", bestScore: 90 }],
      ]),
  };

  const service = new MonitorRecommendationsServiceCtor(
    db,
    jobApplicationsService,
    NO_SAVED_JOBS,
    NOOP_FUNNEL_EVENTS,
    NOOP_PROFILE_MATCH_SERVICE,
    NOOP_MATCHING_ENGINE,
    NOOP_RADAR_PROFILE_SERVICE,
    ALLOW_ENTITLEMENT,
  );

  const { items, total } = await service.list("user-1", {});
  assert.equal(total, 2);
  assert.equal(items.length, 2);
});

test("countByLevel groups active recommendations by opportunityLevel, excluding dismissed", async () => {
  const recommendations = new Map([
    [
      "rec-1",
      buildRecommendationRow("rec-1", {
        userId: "user-1",
        opportunityLevel: 5,
      }),
    ],
    [
      "rec-2",
      buildRecommendationRow("rec-2", {
        userId: "user-1",
        opportunityLevel: 5,
      }),
    ],
    [
      "rec-3",
      buildRecommendationRow("rec-3", {
        userId: "user-1",
        opportunityLevel: 3,
      }),
    ],
    [
      "rec-4",
      buildRecommendationRow("rec-4", {
        userId: "user-1",
        opportunityLevel: 3,
        dismissedAt: new Date(),
      }),
    ],
  ]);
  const db = createDb(recommendations, new Map());
  const service = new MonitorRecommendationsServiceCtor(
    db,
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
    NOOP_FUNNEL_EVENTS,
    NOOP_PROFILE_MATCH_SERVICE,
    NOOP_MATCHING_ENGINE,
    NOOP_RADAR_PROFILE_SERVICE,
    ALLOW_ENTITLEMENT,
  );

  const counts = await service.countByLevel("user-1");
  assert.equal(counts[5], 2);
  assert.equal(counts[3], 1);
  assert.equal(counts[0], 0);
});
