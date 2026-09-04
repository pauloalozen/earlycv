import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { FakeEmailDeliveryService } from "../email/fake-email-delivery.service";
import { MonitorAlertPreferenceService } from "../monitor/monitor-alert-preference.service";
import { MonitorDigestContentService } from "../monitor/monitor-digest-content.service";
import { MonitorDigestEmailService } from "../monitor/monitor-digest-email.service";
import { MonitorEntitlementService } from "../monitor/monitor-entitlement.service";
import { MonitorProfileMatchService } from "../monitor/monitor-profile-match.service";
import { MatchingEngine } from "../radar/matching.engine";
import { AdminMonitorService } from "./admin-monitor.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
// Passa a database real (não vazio): funciona igual antes quando ghost
// mode está off (early-return sem tocar o banco) e passa a funcionar
// corretamente nos testes de sendDigestNow com ghost mode ligado, que
// realmente precisam consultar internalRole.
const entitlementService = new MonitorEntitlementService(database);
const matchingEngine = new MatchingEngine(database);
const profileMatchService = new MonitorProfileMatchService(
  database,
  entitlementService,
);

// Stub — o funil de eventos não é o que este spec verifica; mesmo padrão
// de monitor-alert-preference.service.spec.ts.
const NOOP_FUNNEL_EVENTS = {
  record: async () => ({ event: null, ingested: true }),
};
const alertPreferenceService = new MonitorAlertPreferenceService(
  database,
  NOOP_FUNNEL_EVENTS as never,
  entitlementService,
);
const digestContentService = new MonitorDigestContentService(database);
const digestEmailService = new MonitorDigestEmailService(
  database,
  new FakeEmailDeliveryService(),
  entitlementService,
);

const service = new AdminMonitorService(
  database,
  matchingEngine,
  entitlementService,
  profileMatchService,
  alertPreferenceService,
  digestContentService,
  digestEmailService,
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

// ---------------------------------------------------------------------
// Alerta de Vagas (/admin/alerta-vagas) — elegibilidade/disparo manual,
// histórico e configuração. Ver docs/specs/2026-09-04-admin-alerta-vagas-tab.md.
// ---------------------------------------------------------------------

let originalGhostMode: string | undefined;

function withGhostModeOn() {
  originalGhostMode = process.env.JOBS_GHOST_MODE;
  process.env.JOBS_GHOST_MODE = "true";
}

function restoreGhostMode() {
  if (originalGhostMode === undefined) {
    delete process.env.JOBS_GHOST_MODE;
  } else {
    process.env.JOBS_GHOST_MODE = originalGhostMode;
  }
}

test("trackAlertUser creates a MonitorAlertPreference with the default frequency for a user who never configured one", async () => {
  const user = await seedUser();
  try {
    const result = await service.trackAlertUser("admin-1", user.id);
    assert.equal(result.tracked, true);
    assert.equal(result.frequency, "DAILY");

    const preference = await prisma.monitorAlertPreference.findUnique({
      where: { userId: user.id },
    });
    assert.ok(preference);
    assert.equal(preference?.frequency, "DAILY");
  } finally {
    await prisma.monitorAdminActionLog
      .deleteMany({ where: { entityId: user.id } })
      .catch(() => undefined);
    await cleanupUser(user.id);
  }
});

test("trackAlertUser is idempotent — never overwrites a frequency the user already configured", async () => {
  const user = await seedUser();
  try {
    await prisma.monitorAlertPreference.create({
      data: { userId: user.id, frequency: "WEEKLY" },
    });

    const result = await service.trackAlertUser("admin-1", user.id);

    assert.equal(result.frequency, "WEEKLY");
  } finally {
    await prisma.monitorAdminActionLog
      .deleteMany({ where: { entityId: user.id } })
      .catch(() => undefined);
    await cleanupUser(user.id);
  }
});

test("trackAlertUser throws NotFoundException for a userId that doesn't exist", async () => {
  await assert.rejects(() =>
    service.trackAlertUser("admin-1", "does-not-exist"),
  );
});

test("listTrackedAlertUsers only returns users who already have a MonitorAlertPreference, never the whole user base", async () => {
  const tracked = await seedUser();
  const untracked = await seedUser();
  try {
    await service.trackAlertUser("admin-1", tracked.id);

    const result = await service.listTrackedAlertUsers({});

    assert.ok(result.users.some((u) => u.id === tracked.id));
    assert.ok(!result.users.some((u) => u.id === untracked.id));
  } finally {
    await prisma.monitorAdminActionLog
      .deleteMany({ where: { entityId: tracked.id } })
      .catch(() => undefined);
    await cleanupUser(tracked.id);
    await cleanupUser(untracked.id);
  }
});

test("sendDigestNow rejects (422-equivalent) when the user has no MonitorAlertPreference or it is OFF", async () => {
  const user = await seedUser();
  try {
    await assert.rejects(() => service.sendDigestNow("admin-1", user.id));

    await prisma.monitorAlertPreference.create({
      data: { userId: user.id, frequency: "OFF" },
    });
    await assert.rejects(() => service.sendDigestNow("admin-1", user.id));
  } finally {
    await cleanupUser(user.id);
  }
});

test("sendDigestNow reports not_entitled (and never creates a digest) when the user isn't entitled today", async () => {
  const user = await seedUser();
  try {
    await service.trackAlertUser("admin-1", user.id);
    // Ghost mode off por padrão neste ambiente de teste — ninguém é
    // elegível, nem staff.
    const result = await service.sendDigestNow("admin-1", user.id);

    assert.deepEqual(result, { sent: false, skippedReason: "not_entitled" });
    const digests = await prisma.monitorDigest.findMany({
      where: { userId: user.id },
    });
    assert.equal(digests.length, 0);
  } finally {
    await prisma.monitorAdminActionLog
      .deleteMany({ where: { entityId: user.id } })
      .catch(() => undefined);
    await cleanupUser(user.id);
  }
});

test("sendDigestNow sends synchronously and records source=ADMIN_MANUAL with the triggering admin", async () => {
  withGhostModeOn();
  // sendDigest monta o link de unsubscribe, que exige este secret — mesmo
  // setup de monitor-digest-email.service.spec.ts.
  const originalSecret = process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET;
  process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET = "test-secret";
  const user = await seedUser();
  const { company, job } = await seedCompanyAndJob();
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { internalRole: "admin" },
    });
    await service.trackAlertUser("admin-1", user.id);
    await prisma.userJobRecommendation.create({
      data: { userId: user.id, jobId: job.id, score: 90, opportunityLevel: 5 },
    });

    const result = await service.sendDigestNow("admin-99", user.id);

    assert.equal(result.sent, true);
    assert.ok(result.digestId);

    const digest = await prisma.monitorDigest.findUnique({
      where: { id: result.digestId as string },
    });
    assert.equal(digest?.status, "SENT");
    assert.equal(digest?.source, "ADMIN_MANUAL");
    assert.equal(digest?.triggeredByAdminId, "admin-99");
    assert.equal(digest?.frequency, "DAILY");
  } finally {
    restoreGhostMode();
    process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET = originalSecret;
    // Este log usa o digestId como entityId (não userId) — o mesmo
    // padrão de logAction("digest_manual_send", ..., digest.id, ...)
    // acima em resendDigest.
    await prisma.monitorAdminActionLog
      .deleteMany({
        where: { metadataJson: { path: ["userId"], equals: user.id } },
      })
      .catch(() => undefined);
    await cleanupUser(user.id);
    await cleanupJob(job.id, company.id);
  }
});

test("sendDigestNow reports no_eligible_recommendations without creating a PENDING digest when there is nothing to send", async () => {
  withGhostModeOn();
  const user = await seedUser();
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { internalRole: "admin" },
    });
    await service.trackAlertUser("admin-1", user.id);

    const result = await service.sendDigestNow("admin-99", user.id);

    assert.deepEqual(result, {
      sent: false,
      skippedReason: "no_eligible_recommendations",
    });
  } finally {
    restoreGhostMode();
    await prisma.monitorAdminActionLog
      .deleteMany({ where: { entityId: user.id } })
      .catch(() => undefined);
    await cleanupUser(user.id);
  }
});

test("listDigestHistory filters by source (manual vs automatic) and by user query", async () => {
  const user = await seedUser();
  try {
    const manual = await prisma.monitorDigest.create({
      data: {
        userId: user.id,
        frequency: "DAILY",
        status: "SENT",
        scheduledFor: new Date(),
        source: "ADMIN_MANUAL",
        triggeredByAdminId: "admin-99",
      },
    });
    const automatic = await prisma.monitorDigest.create({
      data: {
        userId: user.id,
        frequency: "WEEKLY",
        status: "SENT",
        scheduledFor: new Date("2026-01-05T00:00:00Z"),
        source: "SCHEDULER",
      },
    });

    const manualOnly = await service.listDigestHistory({ source: "MANUAL" });
    assert.ok(manualOnly.items.some((i) => i.id === manual.id));
    assert.ok(!manualOnly.items.some((i) => i.id === automatic.id));
    const manualEntry = manualOnly.items.find((i) => i.id === manual.id);
    assert.equal(manualEntry?.triggeredByAdmin, null); // admin-99 não existe como User real

    const automaticOnly = await service.listDigestHistory({
      source: "AUTOMATIC",
    });
    assert.ok(automaticOnly.items.some((i) => i.id === automatic.id));
    assert.ok(!automaticOnly.items.some((i) => i.id === manual.id));

    const byUser = await service.listDigestHistory({
      userQuery: user.email.slice(0, 10),
    });
    assert.ok(byUser.items.some((i) => i.id === manual.id));
  } finally {
    await prisma.monitorDigest.deleteMany({ where: { userId: user.id } });
    await cleanupUser(user.id);
  }
});

test("getDigestSchedule / updateDigestSchedule roundtrip through the singleton row", async () => {
  const original = await service.getDigestSchedule();
  try {
    const updated = await service.updateDigestSchedule("admin-1", {
      dailyHour: 8,
      dailyMinute: 15,
      weeklyDayOfWeek: 3,
    });
    assert.equal(updated.dailyHour, 8);
    assert.equal(updated.dailyMinute, 15);
    assert.equal(updated.weeklyDayOfWeek, 3);

    const reread = await service.getDigestSchedule();
    assert.equal(reread.dailyHour, 8);
  } finally {
    await service.updateDigestSchedule("admin-1", {
      dailyHour: original.dailyHour,
      dailyMinute: original.dailyMinute,
      weeklyDayOfWeek: original.weeklyDayOfWeek,
    });
    await prisma.monitorAdminActionLog
      .deleteMany({ where: { entityType: "MonitorDigestScheduleConfig" } })
      .catch(() => undefined);
  }
});

test("getDigestContent / updateDigestContent roundtrip through the singleton row", async () => {
  const original = await service.getDigestContent();
  try {
    const updated = await service.updateDigestContent("admin-1", {
      subject: "Assunto de teste — {count} vagas",
      introText: "Introdução de teste.",
    });
    assert.equal(updated.subject, "Assunto de teste — {count} vagas");
    assert.equal(updated.introText, "Introdução de teste.");

    const reread = await service.getDigestContent();
    assert.equal(reread.subject, "Assunto de teste — {count} vagas");
  } finally {
    await service.updateDigestContent("admin-1", {
      subject: original.subject,
      introText: original.introText,
    });
    await prisma.monitorAdminActionLog
      .deleteMany({ where: { entityType: "MonitorDigestEmailContent" } })
      .catch(() => undefined);
  }
});
