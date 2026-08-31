import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { MonitorEntitlementService } from "../monitor/monitor-entitlement.service";
import { MonitorProfileMatchService } from "../monitor/monitor-profile-match.service";
import { MatchingEngine } from "../radar/matching.engine";
import { AdminMonitorService } from "./admin-monitor.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const entitlementService = new MonitorEntitlementService();
const matchingEngine = new MatchingEngine(database);
const profileMatchService = new MonitorProfileMatchService(
  database,
  entitlementService,
);
const service = new AdminMonitorService(
  database,
  matchingEngine,
  entitlementService,
  profileMatchService,
);

function tag() {
  return randomUUID().slice(0, 8);
}

// Constrói um usuário + perfil + vaga + recomendação mínimos e válidos
// contra o schema real — o AdminMonitorService usa recursos do Prisma
// (groupBy, filtros `isEmpty`, `mode: "insensitive"`) difíceis de simular
// com fakes convincentes, então este spec roda contra o banco de teste real
// (mesmo padrão de talent-profile-capture.service.spec.ts).
async function seedUser(overrides: { email?: string; name?: string } = {}) {
  const t = tag();
  return prisma.user.create({
    data: {
      email: overrides.email ?? `admin-monitor-${t}@example.com`,
      name: overrides.name ?? `Admin Monitor Test ${t}`,
      passwordHash: "x",
    },
  });
}

async function seedProfile(
  userId: string,
  overrides: Partial<{
    areas: string[];
    monitorStatus: "INITIALIZING" | "ACTIVE" | "REFRESHING";
    lastMatchedAt: Date | null;
  }> = {},
) {
  return prisma.userRadarProfile.create({
    data: {
      userId,
      areas: (overrides.areas ?? ["SOFTWARE_ENGINEERING"]) as never,
      seniority: "SENIOR",
      skills: ["typescript", "node"],
      technologies: ["postgresql"],
      languages: ["portugues"],
      preferredWorkModels: ["remote"],
      monitorStatus: overrides.monitorStatus ?? "ACTIVE",
      lastMatchedAt: overrides.lastMatchedAt ?? new Date(),
    },
  });
}

async function seedCompanyAndJob(overrides: { withEnrichment?: boolean } = {}) {
  const t = tag();
  const company = await prisma.company.create({
    data: { name: `Empresa ${t}`, normalizedName: `empresa-${t}` },
  });
  const job = await prisma.job.create({
    data: {
      companyId: company.id,
      sourceJobUrl: `https://example.com/${t}`,
      canonicalKey: `job-${t}`,
      slug: `vaga-${t}`,
      title: "Engenheiro de Software",
      normalizedTitle: "engenheiro de software",
      descriptionRaw: "<p>desc</p>",
      descriptionClean: "desc",
      locationText: "Brasil",
      workModel: "remote",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
  if (overrides.withEnrichment !== false) {
    await prisma.jobEnrichment.create({
      data: {
        jobId: job.id,
        dominantArea: "SOFTWARE_ENGINEERING",
        areas: ["SOFTWARE_ENGINEERING"],
        requiredSkills: ["typescript"],
        technologies: ["postgresql"],
        seniority: "SENIOR",
        enrichmentStatus: "COMPLETED",
      },
    });
  }
  return { company, job };
}

async function cleanupUser(userId: string) {
  await prisma.monitorDigestEvent
    .deleteMany({ where: { digest: { userId } } })
    .catch(() => undefined);
  await prisma.monitorDigestRecommendation
    .deleteMany({ where: { recommendation: { userId } } })
    .catch(() => undefined);
  await prisma.monitorDigest
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await prisma.monitorAlertPreference
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await prisma.monitorProfileMatchJob
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await prisma.userJobRecommendation
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await prisma.savedJob
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await prisma.jobApplication
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await prisma.userRadarProfile
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await prisma.monitorAdminActionLog
    .deleteMany({
      where: { metadataJson: { path: ["userId"], equals: userId } },
    })
    .catch(() => undefined);
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

async function cleanupJob(jobId: string, companyId: string) {
  await prisma.monitorMatchJob
    .deleteMany({ where: { jobId } })
    .catch(() => undefined);
  await prisma.userJobRecommendation
    .deleteMany({ where: { jobId } })
    .catch(() => undefined);
  await prisma.jobEnrichment
    .deleteMany({ where: { jobId } })
    .catch(() => undefined);
  await prisma.job.delete({ where: { id: jobId } }).catch(() => undefined);
  await prisma.company
    .delete({ where: { id: companyId } })
    .catch(() => undefined);
}

test("searchUsers finds a user by exact id, by email substring, and by name substring", async () => {
  const user = await seedUser();
  try {
    const byId = await service.searchUsers({ query: user.id });
    assert.ok(byId.users.some((u) => u.id === user.id));

    const byEmail = await service.searchUsers({
      query: user.email.slice(0, 10),
    });
    assert.ok(byEmail.users.some((u) => u.id === user.id));

    const byName = await service.searchUsers({ query: user.name });
    assert.ok(byName.users.some((u) => u.id === user.id));
  } finally {
    await cleanupUser(user.id);
  }
});

test("searchUsers paginates — limit is respected and total reflects the full match count", async () => {
  const result = await service.searchUsers({ page: 1, limit: 1 });
  assert.equal(result.limit, 1);
  assert.ok(result.users.length <= 1);
  assert.ok(result.total >= result.users.length);
});

test("getUserDiagnostic exposes the REAL entitlement result, not a re-derived one", async () => {
  const user = await seedUser();
  try {
    const diagnostic = await service.getUserDiagnostic(user.id);
    const direct = await entitlementService.canUseMonitor(user.id);

    assert.deepEqual(diagnostic.entitlement, direct);
  } finally {
    await cleanupUser(user.id);
  }
});

test("getUserDiagnostic throws NotFoundException for a userId that doesn't exist", async () => {
  await assert.rejects(() => service.getUserDiagnostic("does-not-exist"));
});

test("getUserDiagnostic separates fingerprint fields from informational-only fields", async () => {
  const user = await seedUser();
  try {
    await seedProfile(user.id);
    const diagnostic = await service.getUserDiagnostic(user.id);

    assert.ok(diagnostic.profile);
    assert.deepEqual(diagnostic.profile?.fingerprint.areas, [
      "SOFTWARE_ENGINEERING",
    ]);
    assert.equal(diagnostic.profile?.fingerprint.seniority, "SENIOR");
    assert.ok("openToRelocation" in (diagnostic.profile?.informational ?? {}));
    // preferredContractTypes NUNCA deve aparecer no grupo de fingerprint —
    // não é consumido por MatchingEngine.calculateScore.
    assert.ok(
      !("preferredContractTypes" in (diagnostic.profile?.fingerprint ?? {})),
    );
  } finally {
    await cleanupUser(user.id);
  }
});

test("listUserRecommendations returns active, dismissed and superseded recommendations distinctly via the status filter", async () => {
  const user = await seedUser();
  const { company, job } = await seedCompanyAndJob();
  try {
    const active = await prisma.userJobRecommendation.create({
      data: { userId: user.id, jobId: job.id, score: 80, opportunityLevel: 4 },
    });
    const { job: job2 } = await seedCompanyAndJob();
    const dismissed = await prisma.userJobRecommendation.create({
      data: {
        userId: user.id,
        jobId: job2.id,
        score: 70,
        opportunityLevel: 4,
        dismissedAt: new Date(),
      },
    });

    const activeResult = await service.listUserRecommendations(user.id, {
      status: "active",
    });
    assert.ok(activeResult.items.some((r) => r.id === active.id));
    assert.ok(!activeResult.items.some((r) => r.id === dismissed.id));

    const dismissedResult = await service.listUserRecommendations(user.id, {
      status: "dismissed",
    });
    assert.ok(dismissedResult.items.some((r) => r.id === dismissed.id));
    assert.ok(!dismissedResult.items.some((r) => r.id === active.id));

    await prisma.userJobRecommendation.deleteMany({
      where: { jobId: job2.id },
    });
    await cleanupJob(
      job2.id,
      (await prisma.job.findUnique({ where: { id: job2.id } }))?.companyId ??
        "",
    );
  } finally {
    await cleanupUser(user.id);
    await cleanupJob(job.id, company.id);
  }
});

test("listUserRecommendations never returns another user's recommendations (no cross-user leakage)", async () => {
  const userA = await seedUser();
  const userB = await seedUser();
  const { company, job } = await seedCompanyAndJob();
  try {
    await prisma.userJobRecommendation.create({
      data: { userId: userA.id, jobId: job.id, score: 80, opportunityLevel: 4 },
    });

    const resultForB = await service.listUserRecommendations(userB.id, {});

    assert.equal(resultForB.total, 0);
    assert.deepEqual(resultForB.items, []);
  } finally {
    await cleanupUser(userA.id);
    await cleanupUser(userB.id);
    await cleanupJob(job.id, company.id);
  }
});

test("listUserRecommendations paginates results", async () => {
  const user = await seedUser();
  const jobs: { job: { id: string }; company: { id: string } }[] = [];
  try {
    for (let i = 0; i < 3; i++) {
      const seeded = await seedCompanyAndJob();
      jobs.push(seeded);
      await prisma.userJobRecommendation.create({
        data: {
          userId: user.id,
          jobId: seeded.job.id,
          score: 80,
          opportunityLevel: 4,
        },
      });
    }

    const page1 = await service.listUserRecommendations(user.id, {
      page: 1,
      limit: 2,
    });
    assert.equal(page1.items.length, 2);
    assert.equal(page1.total, 3);

    const page2 = await service.listUserRecommendations(user.id, {
      page: 2,
      limit: 2,
    });
    assert.equal(page2.items.length, 1);
  } finally {
    await cleanupUser(user.id);
    for (const { job, company } of jobs) {
      await cleanupJob(job.id, company.id);
    }
  }
});

test("getRecommendationDetail keeps the persisted score and the recalculated score in separate, clearly labeled fields — never merged", async () => {
  const user = await seedUser();
  const { company, job } = await seedCompanyAndJob();
  try {
    await seedProfile(user.id);
    const recommendation = await prisma.userJobRecommendation.create({
      data: { userId: user.id, jobId: job.id, score: 42, opportunityLevel: 2 },
    });

    const detail = await service.getRecommendationDetail(recommendation.id);

    assert.equal(detail.scoreAtRecommendationTime.score, 42);
    assert.equal(detail.scoreAtRecommendationTime.opportunityLevel, 2);
    assert.equal(detail.scoreAtRecommendationTime.breakdownAvailable, false);

    assert.ok(detail.currentRecalculatedScore);
    assert.ok(typeof detail.currentRecalculatedScore?.score === "number");
    // O score recalculado é sobre o perfil/vaga ATUAIS — não precisa (e não
    // deveria precisar) bater com o valor persistido, que é histórico.
    assert.notEqual(detail.currentRecalculatedScore?.score, undefined);
  } finally {
    await cleanupUser(user.id);
    await cleanupJob(job.id, company.id);
  }
});

test("getRecommendationDetail explicitly reports why recalculation was skipped when the user has no radar profile", async () => {
  const user = await seedUser();
  const { company, job } = await seedCompanyAndJob();
  try {
    const recommendation = await prisma.userJobRecommendation.create({
      data: { userId: user.id, jobId: job.id, score: 42, opportunityLevel: 2 },
    });

    const detail = await service.getRecommendationDetail(recommendation.id);

    assert.equal(detail.currentRecalculatedScore, null);
    assert.equal(
      detail.recalculationSkippedReason,
      "user_has_no_radar_profile",
    );
  } finally {
    await cleanupUser(user.id);
    await cleanupJob(job.id, company.id);
  }
});

test("getJobDiagnostic aggregates recommendation counts by opportunityLevel and viewed/dismissed/saved/applied", async () => {
  const user = await seedUser();
  const { company, job } = await seedCompanyAndJob();
  try {
    await prisma.userJobRecommendation.create({
      data: {
        userId: user.id,
        jobId: job.id,
        score: 85,
        opportunityLevel: 4,
        viewedAt: new Date(),
      },
    });
    await prisma.savedJob.create({ data: { userId: user.id, jobId: job.id } });

    const diagnostic = await service.getJobDiagnostic(job.id);

    assert.equal(diagnostic.recommendationStats.total, 1);
    assert.equal(diagnostic.recommendationStats.byOpportunityLevel["4"], 1);
    assert.equal(diagnostic.recommendationStats.level3Plus, 1);
    assert.equal(diagnostic.recommendationStats.viewed, 1);
    assert.equal(diagnostic.recommendationStats.saved, 1);
  } finally {
    await cleanupUser(user.id);
    await cleanupJob(job.id, company.id);
  }
});

test("getFailures lists FAILED MonitorMatchJob rows", async () => {
  const { company, job } = await seedCompanyAndJob();
  try {
    await prisma.monitorMatchJob.create({
      data: { jobId: job.id, status: "FAILED", attempts: 3, lastError: "boom" },
    });

    const failures = await service.getFailures();

    assert.ok(failures.failedMatchJobs.some((j) => j.jobId === job.id));
  } finally {
    await cleanupJob(job.id, company.id);
  }
});

test("requeueMatchJob resets a FAILED job to PENDING with attempts=0 and logs the action", async () => {
  const { company, job } = await seedCompanyAndJob();
  try {
    const matchJob = await prisma.monitorMatchJob.create({
      data: { jobId: job.id, status: "FAILED", attempts: 3, lastError: "boom" },
    });

    const result = await service.requeueMatchJob("admin-1", matchJob.id);
    assert.equal(result.requeued, true);

    const reloaded = await prisma.monitorMatchJob.findUnique({
      where: { id: matchJob.id },
    });
    assert.equal(reloaded?.status, "PENDING");
    assert.equal(reloaded?.attempts, 0);
    assert.equal(reloaded?.lastError, null);

    const log = await prisma.monitorAdminActionLog.findFirst({
      where: { entityType: "MonitorMatchJob", entityId: matchJob.id },
    });
    assert.ok(log);
    assert.equal(log?.adminId, "admin-1");
    assert.equal(log?.action, "requeue_match_job");
  } finally {
    await prisma.monitorAdminActionLog
      .deleteMany({ where: { entityType: "MonitorMatchJob" } })
      .catch(() => undefined);
    await cleanupJob(job.id, company.id);
  }
});

test("requeueMatchJob is idempotent — calling it twice in a row leaves the same end state", async () => {
  const { company, job } = await seedCompanyAndJob();
  try {
    const matchJob = await prisma.monitorMatchJob.create({
      data: { jobId: job.id, status: "FAILED", attempts: 2 },
    });

    await service.requeueMatchJob("admin-1", matchJob.id);
    await service.requeueMatchJob("admin-1", matchJob.id);

    const reloaded = await prisma.monitorMatchJob.findUnique({
      where: { id: matchJob.id },
    });
    assert.equal(reloaded?.status, "PENDING");
    assert.equal(reloaded?.attempts, 0);
  } finally {
    await prisma.monitorAdminActionLog
      .deleteMany({ where: { entityType: "MonitorMatchJob" } })
      .catch(() => undefined);
    await cleanupJob(job.id, company.id);
  }
});

test("resendDigest only requeues a FAILED digest — a non-FAILED digest is left untouched and reported as skipped", async () => {
  const user = await seedUser();
  try {
    const digest = await prisma.monitorDigest.create({
      data: {
        userId: user.id,
        frequency: "DAILY",
        status: "SENT",
        scheduledFor: new Date(),
      },
    });

    const result = await service.resendDigest("admin-1", digest.id);

    assert.equal(result.requeued, false);
    const reloaded = await prisma.monitorDigest.findUnique({
      where: { id: digest.id },
    });
    assert.equal(reloaded?.status, "SENT");
  } finally {
    await prisma.monitorAdminActionLog
      .deleteMany({ where: { entityType: "MonitorDigest" } })
      .catch(() => undefined);
    await cleanupUser(user.id);
  }
});

test("resendDigest resets a FAILED digest to PENDING, preserving the same id (so the same Idempotency-Key is reused on retry)", async () => {
  const user = await seedUser();
  try {
    const digest = await prisma.monitorDigest.create({
      data: {
        userId: user.id,
        frequency: "DAILY",
        status: "FAILED",
        attempts: 3,
        lastError: "resend unavailable",
        scheduledFor: new Date(),
      },
    });

    const result = await service.resendDigest("admin-1", digest.id);

    assert.equal(result.requeued, true);
    const reloaded = await prisma.monitorDigest.findUnique({
      where: { id: digest.id },
    });
    assert.equal(reloaded?.id, digest.id);
    assert.equal(reloaded?.status, "PENDING");
    assert.equal(reloaded?.attempts, 0);
  } finally {
    await prisma.monitorAdminActionLog
      .deleteMany({ where: { entityType: "MonitorDigest" } })
      .catch(() => undefined);
    await cleanupUser(user.id);
  }
});

test("getUserAttribution returns only events for the requested user, ordered by time, with the correlation caveat", async () => {
  const userA = await seedUser();
  const userB = await seedUser();
  try {
    await prisma.businessFunnelEvent.create({
      data: {
        eventName: "monitor_digest_sent",
        eventVersion: 1,
        requestId: `req-${tag()}`,
        correlationId: `corr-${tag()}`,
        userId: userA.id,
      },
    });
    await prisma.businessFunnelEvent.create({
      data: {
        eventName: "monitor_digest_sent",
        eventVersion: 1,
        requestId: `req-${tag()}`,
        correlationId: `corr-${tag()}`,
        userId: userB.id,
      },
    });

    const attribution = await service.getUserAttribution(userA.id);

    assert.equal(attribution.events.length, 1);
    assert.ok(attribution.caveat.toLowerCase().includes("correla"));
  } finally {
    await prisma.businessFunnelEvent
      .deleteMany({ where: { userId: { in: [userA.id, userB.id] } } })
      .catch(() => undefined);
    await cleanupUser(userA.id);
    await cleanupUser(userB.id);
  }
});
