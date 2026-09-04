import assert from "node:assert/strict";
import { test } from "node:test";

import { MonitorNotificationsService } from "./monitor-notifications.service";

const MonitorNotificationsServiceCtor =
  MonitorNotificationsService as unknown as new (
    db: unknown,
    jobApplicationsService: unknown,
    savedJobsService: unknown,
  ) => MonitorNotificationsService;

const NO_APPLICATIONS = { getBestScoresByJobIds: async () => new Map() };
const NO_SAVED_JOBS = { listSavedJobIds: async () => new Set<string>() };

function buildJobRow(id: string) {
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
    supersededAt: null,
    feedback: null,
    feedbackReason: null,
    ...overrides,
  };
}

function buildDigestRow(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    userId: "user-1",
    status: "SENT",
    sentAt: new Date("2026-09-01T09:00:00Z"),
    frequency: "DAILY",
    ...overrides,
  };
}

// db mínimo, propositalmente específico ao shape que
// MonitorNotificationsService realmente manda — não um emulador
// genérico de Prisma (mesmo padrão de monitor-recommendations.service.spec.ts).
function createDb(input: {
  digests: Map<string, ReturnType<typeof buildDigestRow>>;
  recommendations: Map<string, ReturnType<typeof buildRecommendationRow>>;
  // recommendationId -> lista de digestIds que a incluíram (qualquer status)
  inclusions: Map<string, string[]>;
  jobs: Map<string, ReturnType<typeof buildJobRow>>;
}) {
  const { digests, recommendations, inclusions, jobs } = input;

  return {
    userRadarProfile: {
      findUnique: async () => ({ monitorStatus: "ACTIVE" }),
    },
    monitorDigest: {
      findMany: async ({
        where,
        skip = 0,
        take,
      }: {
        where: { userId: string; status?: string; sentAt?: { not: null } };
        skip?: number;
        take?: number;
      }) => {
        const rows = Array.from(digests.values())
          .filter(
            (d) =>
              d.userId === where.userId &&
              (where.status === undefined || d.status === where.status) &&
              (where.sentAt === undefined || d.sentAt !== null),
          )
          .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
          .slice(skip, take !== undefined ? skip + take : undefined);

        return rows.map((digest) => ({
          ...digest,
          recommendations: (inclusions.get(digest.id) ? [] : [])
            .concat(
              Array.from(inclusions.entries())
                .filter(([, digestIds]) => digestIds.includes(digest.id))
                .map(([recommendationId]) => recommendationId),
            )
            .map((recommendationId) => {
              const rec = recommendations.get(recommendationId);
              assert.ok(rec, `recommendation ${recommendationId} must exist`);
              return {
                recommendation: { ...rec, job: jobs.get(rec.jobId) },
              };
            }),
        }));
      },
      count: async ({
        where,
      }: {
        where: { userId: string; status?: string; sentAt?: { not: null } };
      }) =>
        Array.from(digests.values()).filter(
          (d) =>
            d.userId === where.userId &&
            (where.status === undefined || d.status === where.status) &&
            (where.sentAt === undefined || d.sentAt !== null),
        ).length,
    },
    userJobRecommendation: {
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: {
          userId: string;
          dismissedAt: null;
          supersededAt: null;
        };
        orderBy?: unknown;
        take?: number;
      }) => {
        const rows = Array.from(recommendations.values())
          .filter(
            (r) =>
              r.userId === where.userId &&
              r.dismissedAt === where.dismissedAt &&
              r.supersededAt === where.supersededAt &&
              !hasSentInclusion(r.id, inclusions, digests),
          )
          .sort((a, b) => b.recommendedAt.getTime() - a.recommendedAt.getTime())
          .slice(0, take);
        return rows.map((r) => ({ ...r, job: jobs.get(r.jobId) }));
      },
      count: async ({
        where,
      }: {
        where: { userId: string; dismissedAt: null; supersededAt: null };
      }) =>
        Array.from(recommendations.values()).filter(
          (r) =>
            r.userId === where.userId &&
            r.dismissedAt === where.dismissedAt &&
            r.supersededAt === where.supersededAt &&
            !hasSentInclusion(r.id, inclusions, digests),
        ).length,
    },
  };
}

function hasSentInclusion(
  recommendationId: string,
  inclusions: Map<string, string[]>,
  digests: Map<string, ReturnType<typeof buildDigestRow>>,
): boolean {
  const digestIds = inclusions.get(recommendationId) ?? [];
  return digestIds.some((digestId) => digests.get(digestId)?.status === "SENT");
}

test("groups: only SENT digests become groups (PENDING/FAILED are excluded)", async () => {
  const digests = new Map([
    ["digest-sent", buildDigestRow("digest-sent", { status: "SENT" })],
    ["digest-pending", buildDigestRow("digest-pending", { status: "PENDING", sentAt: null })],
    ["digest-failed", buildDigestRow("digest-failed", { status: "FAILED", sentAt: null })],
  ]);
  const recommendations = new Map([
    ["rec-1", buildRecommendationRow("rec-1")],
  ]);
  const inclusions = new Map([["rec-1", ["digest-sent"]]]);
  const jobs = new Map([["job-of-rec-1", buildJobRow("job-of-rec-1")]]);

  const service = new MonitorNotificationsServiceCtor(
    createDb({ digests, recommendations, inclusions, jobs }),
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
  );

  const result = await service.listNotifications("user-1", {});
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].digestId, "digest-sent");
  assert.equal(result.totalGroups, 1);
});

test("pending bucket: a recommendation with zero inclusions is pending", async () => {
  const recommendations = new Map([
    ["rec-1", buildRecommendationRow("rec-1")],
  ]);
  const jobs = new Map([["job-of-rec-1", buildJobRow("job-of-rec-1")]]);

  const service = new MonitorNotificationsServiceCtor(
    createDb({
      digests: new Map(),
      recommendations,
      inclusions: new Map(),
      jobs,
    }),
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
  );

  const result = await service.listNotifications("user-1", {});
  assert.ok(result.pending);
  assert.equal(result.pending?.items.length, 1);
  assert.equal(result.pending?.items[0].recommendationId, "rec-1");
});

test("pending bucket: a recommendation only in a PENDING/FAILED digest is still pending (never actually sent)", async () => {
  const digests = new Map([
    ["digest-pending", buildDigestRow("digest-pending", { status: "PENDING", sentAt: null })],
  ]);
  const recommendations = new Map([
    ["rec-1", buildRecommendationRow("rec-1")],
  ]);
  const inclusions = new Map([["rec-1", ["digest-pending"]]]);
  const jobs = new Map([["job-of-rec-1", buildJobRow("job-of-rec-1")]]);

  const service = new MonitorNotificationsServiceCtor(
    createDb({ digests, recommendations, inclusions, jobs }),
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
  );

  const result = await service.listNotifications("user-1", {});
  assert.equal(result.pending?.items.length, 1);
});

test("pending bucket: a recommendation with a SENT inclusion is excluded, even if it also has an old FAILED inclusion", async () => {
  const digests = new Map([
    ["digest-failed", buildDigestRow("digest-failed", { status: "FAILED", sentAt: null })],
    ["digest-sent", buildDigestRow("digest-sent", { status: "SENT" })],
  ]);
  const recommendations = new Map([
    ["rec-1", buildRecommendationRow("rec-1")],
  ]);
  const inclusions = new Map([["rec-1", ["digest-failed", "digest-sent"]]]);
  const jobs = new Map([["job-of-rec-1", buildJobRow("job-of-rec-1")]]);

  const service = new MonitorNotificationsServiceCtor(
    createDb({ digests, recommendations, inclusions, jobs }),
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
  );

  const result = await service.listNotifications("user-1", {});
  assert.equal(result.pending?.items.length, 0);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].items[0].recommendationId, "rec-1");
});

test("pending bucket: dismissed/superseded recommendations never appear, regardless of inclusions", async () => {
  const recommendations = new Map([
    ["rec-dismissed", buildRecommendationRow("rec-dismissed", { dismissedAt: new Date() })],
    ["rec-superseded", buildRecommendationRow("rec-superseded", { supersededAt: new Date() })],
  ]);
  const jobs = new Map([
    ["job-of-rec-dismissed", buildJobRow("job-of-rec-dismissed")],
    ["job-of-rec-superseded", buildJobRow("job-of-rec-superseded")],
  ]);

  const service = new MonitorNotificationsServiceCtor(
    createDb({
      digests: new Map(),
      recommendations,
      inclusions: new Map(),
      jobs,
    }),
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
  );

  const result = await service.listNotifications("user-1", {});
  assert.equal(result.pending?.items.length, 0);
});

test("score/opportunityLevel returned are always the persisted values, never recalculated", async () => {
  const digests = new Map([["digest-sent", buildDigestRow("digest-sent")]]);
  const recommendations = new Map([
    [
      "rec-1",
      buildRecommendationRow("rec-1", { score: 63, opportunityLevel: 3 }),
    ],
  ]);
  const inclusions = new Map([["rec-1", ["digest-sent"]]]);
  const jobs = new Map([["job-of-rec-1", buildJobRow("job-of-rec-1")]]);

  const service = new MonitorNotificationsServiceCtor(
    createDb({ digests, recommendations, inclusions, jobs }),
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
  );

  const result = await service.listNotifications("user-1", {});
  assert.equal(result.groups[0].items[0].score, 63);
  assert.equal(result.groups[0].items[0].opportunityLevel, 3);
});

test("a dismissed item inside a SENT group is not filtered out — dismissedAt travels through so the frontend can show 'Descartada'", async () => {
  const digests = new Map([["digest-sent", buildDigestRow("digest-sent")]]);
  const dismissedAt = new Date("2026-09-02T00:00:00Z");
  const recommendations = new Map([
    ["rec-1", buildRecommendationRow("rec-1", { dismissedAt })],
  ]);
  const inclusions = new Map([["rec-1", ["digest-sent"]]]);
  const jobs = new Map([["job-of-rec-1", buildJobRow("job-of-rec-1")]]);

  const service = new MonitorNotificationsServiceCtor(
    createDb({ digests, recommendations, inclusions, jobs }),
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
  );

  const result = await service.listNotifications("user-1", {});
  assert.equal(result.groups[0].total, 1);
  assert.equal(
    result.groups[0].items[0].dismissedAt,
    dismissedAt.toISOString(),
  );
});

test("pagination: page/limit walk through SENT digests newest-first, pending only on page 1, hasMore/nextPage are correct", async () => {
  const digests = new Map([
    ["digest-1", buildDigestRow("digest-1", { sentAt: new Date("2026-09-01T00:00:00Z") })],
    ["digest-2", buildDigestRow("digest-2", { sentAt: new Date("2026-09-02T00:00:00Z") })],
  ]);
  const recommendations = new Map([
    ["rec-1", buildRecommendationRow("rec-1")],
    ["rec-2", buildRecommendationRow("rec-2")],
    ["rec-pending", buildRecommendationRow("rec-pending")],
  ]);
  const inclusions = new Map([
    ["rec-1", ["digest-1"]],
    ["rec-2", ["digest-2"]],
  ]);
  const jobs = new Map([
    ["job-of-rec-1", buildJobRow("job-of-rec-1")],
    ["job-of-rec-2", buildJobRow("job-of-rec-2")],
    ["job-of-rec-pending", buildJobRow("job-of-rec-pending")],
  ]);

  const service = new MonitorNotificationsServiceCtor(
    createDb({ digests, recommendations, inclusions, jobs }),
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
  );

  const page1 = await service.listNotifications("user-1", { limit: 1 });
  assert.equal(page1.groups.length, 1);
  assert.equal(page1.groups[0].digestId, "digest-2");
  assert.ok(page1.pending);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.nextPage, 2);

  const page2 = await service.listNotifications("user-1", {
    page: 2,
    limit: 1,
  });
  assert.equal(page2.groups.length, 1);
  assert.equal(page2.groups[0].digestId, "digest-1");
  assert.equal(page2.pending, null);
  assert.equal(page2.hasMore, false);
  assert.equal(page2.nextPage, null);
});

test("pending bucket respects pendingLimit and reports hasMore/total correctly when truncated", async () => {
  const recommendations = new Map(
    Array.from({ length: 5 }, (_, i) => [
      `rec-${i}`,
      buildRecommendationRow(`rec-${i}`),
    ]),
  );
  const jobs = new Map(
    Array.from({ length: 5 }, (_, i) => [
      `job-of-rec-${i}`,
      buildJobRow(`job-of-rec-${i}`),
    ]),
  );

  const service = new MonitorNotificationsServiceCtor(
    createDb({
      digests: new Map(),
      recommendations,
      inclusions: new Map(),
      jobs,
    }),
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
  );

  const result = await service.listNotifications("user-1", {
    pendingLimit: 2,
  });
  assert.equal(result.pending?.items.length, 2);
  assert.equal(result.pending?.total, 5);
  assert.equal(result.pending?.hasMore, true);
});

test("the same recommendation present in two SENT digests appears in both groups (no frontend dedup)", async () => {
  const digests = new Map([
    ["digest-1", buildDigestRow("digest-1", { sentAt: new Date("2026-09-01T00:00:00Z") })],
    ["digest-2", buildDigestRow("digest-2", { sentAt: new Date("2026-09-02T00:00:00Z") })],
  ]);
  const recommendations = new Map([
    ["rec-1", buildRecommendationRow("rec-1")],
  ]);
  const inclusions = new Map([["rec-1", ["digest-1", "digest-2"]]]);
  const jobs = new Map([["job-of-rec-1", buildJobRow("job-of-rec-1")]]);

  const service = new MonitorNotificationsServiceCtor(
    createDb({ digests, recommendations, inclusions, jobs }),
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
  );

  const result = await service.listNotifications("user-1", {});
  assert.equal(result.groups.length, 2);
  assert.ok(
    result.groups.every((g) => g.items[0]?.recommendationId === "rec-1"),
  );
});

test("a SENT digest with sentAt: null (corrupted data) is excluded from groups", async () => {
  const digests = new Map([
    ["digest-corrupt", buildDigestRow("digest-corrupt", { sentAt: null })],
  ]);

  const service = new MonitorNotificationsServiceCtor(
    createDb({
      digests,
      recommendations: new Map(),
      inclusions: new Map(),
      jobs: new Map(),
    }),
    NO_APPLICATIONS,
    NO_SAVED_JOBS,
  );

  const result = await service.listNotifications("user-1", {});
  assert.equal(result.groups.length, 0);
  assert.equal(result.totalGroups, 0);
});
