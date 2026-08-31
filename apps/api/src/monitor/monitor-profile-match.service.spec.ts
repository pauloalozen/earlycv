import assert from "node:assert/strict";
import { test } from "node:test";

import { computeMonitorMatchFingerprint } from "./monitor-profile-fingerprint";
import { MonitorProfileMatchService } from "./monitor-profile-match.service";

const MonitorProfileMatchServiceCtor =
  MonitorProfileMatchService as unknown as new (
    db: unknown,
    entitlementService?: unknown,
  ) => MonitorProfileMatchService;

const ALLOW_ENTITLEMENT = {
  canUseMonitor: async () => ({ allowed: true, reason: "launch_access" }),
};
const DENY_ENTITLEMENT = {
  canUseMonitor: async () => ({ allowed: false, reason: "none" }),
};

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    areas: ["SOFTWARE_ENGINEERING"],
    seniority: "SENIOR",
    skills: ["typescript"],
    technologies: [],
    languages: [],
    preferredWorkModels: [],
    matchFingerprint: null,
    lastMatchedAt: null,
    monitorStatus: "INITIALIZING",
    ...overrides,
  };
}

function createDb(profile: ReturnType<typeof buildProfile> | null) {
  const matchJobs = new Map<
    string,
    {
      userId: string;
      status: string;
      attempts: number;
      lastError: string | null;
    }
  >();
  let currentProfile = profile;
  const profileUpdates: Record<string, unknown>[] = [];

  return {
    getMatchJobs: () => matchJobs,
    getProfile: () => currentProfile,
    getProfileUpdates: () => profileUpdates,
    userRadarProfile: {
      findUnique: async () => currentProfile,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        const before = currentProfile;
        assert.ok(before);
        profileUpdates.push(data);
        currentProfile = { ...before, ...data } as never;
        return currentProfile;
      },
    },
    monitorProfileMatchJob: {
      findUnique: async () => matchJobs.get("user-1") ?? null,
      upsert: async ({
        create,
        update,
      }: {
        where: { userId: string };
        create: { userId: string };
        update: Record<string, unknown>;
      }) => {
        const existing = matchJobs.get(create.userId);
        const next = existing
          ? { ...existing, ...update }
          : {
              userId: create.userId,
              status: "PENDING",
              attempts: 0,
              lastError: null,
            };
        matchJobs.set(create.userId, next);
        return next;
      },
    },
  };
}

test("ensureMonitorInitialized enqueues a match job the first time a valid profile is seen", async () => {
  const db = createDb(buildProfile());
  const service = new MonitorProfileMatchServiceCtor(db, ALLOW_ENTITLEMENT);

  await service.ensureMonitorInitialized("user-1");

  assert.equal(db.getMatchJobs().get("user-1")?.status, "PENDING");
});

test("ensureMonitorInitialized is a no-op once the profile already matched successfully", async () => {
  const db = createDb(buildProfile({ lastMatchedAt: new Date() }));
  const service = new MonitorProfileMatchServiceCtor(db, ALLOW_ENTITLEMENT);

  await service.ensureMonitorInitialized("user-1");

  assert.equal(db.getMatchJobs().size, 0);
});

test("ensureMonitorInitialized is a no-op without a UserRadarProfile (nothing to monitor yet)", async () => {
  const db = createDb(null);
  const service = new MonitorProfileMatchServiceCtor(db, ALLOW_ENTITLEMENT);

  await service.ensureMonitorInitialized("user-1");

  assert.equal(db.getMatchJobs().size, 0);
});

test("ensureMonitorInitialized retries once more when the previous match job FAILED and the profile was never matched", async () => {
  const db = createDb(buildProfile());
  db.getMatchJobs().set("user-1", {
    userId: "user-1",
    status: "FAILED",
    attempts: 3,
    lastError: "boom",
  });
  const service = new MonitorProfileMatchServiceCtor(db, ALLOW_ENTITLEMENT);

  await service.ensureMonitorInitialized("user-1");

  const job = db.getMatchJobs().get("user-1");
  assert.equal(job?.status, "PENDING");
  assert.equal(job?.attempts, 0);
});

test("enqueueRematch is skipped (idempotent) when the edit didn't change any matching-relevant field", async () => {
  const profile = buildProfile({ lastMatchedAt: new Date() });
  profile.matchFingerprint = computeMonitorMatchFingerprint(profile as never);
  const db = createDb(profile);
  const service = new MonitorProfileMatchServiceCtor(db, ALLOW_ENTITLEMENT);

  await service.enqueueRematch("user-1");

  assert.equal(db.getMatchJobs().size, 0);
  assert.equal(db.getProfileUpdates().length, 0);
});

test("enqueueRematch enqueues work and sets monitorStatus=REFRESHING when a relevant field changed", async () => {
  const profile = buildProfile({
    lastMatchedAt: new Date(),
    matchFingerprint: "stale-fingerprint",
  });
  const db = createDb(profile);
  const service = new MonitorProfileMatchServiceCtor(db, ALLOW_ENTITLEMENT);

  await service.enqueueRematch("user-1");

  assert.equal(db.getMatchJobs().get("user-1")?.status, "PENDING");
  assert.equal(db.getProfile()?.monitorStatus, "REFRESHING");
});

test("enqueueRematch keeps monitorStatus=INITIALIZING when the profile never completed a first match", async () => {
  const profile = buildProfile({
    lastMatchedAt: null,
    monitorStatus: "INITIALIZING",
  });
  const db = createDb(profile);
  const service = new MonitorProfileMatchServiceCtor(db, ALLOW_ENTITLEMENT);

  await service.enqueueRematch("user-1");

  assert.equal(db.getProfile()?.monitorStatus, "INITIALIZING");
});

test("two rapid profile edits both call enqueueRematch but only coalesce into one PENDING job row", async () => {
  const profile = buildProfile({
    lastMatchedAt: new Date(),
    matchFingerprint: "stale-fingerprint",
  });
  const db = createDb(profile);
  const service = new MonitorProfileMatchServiceCtor(db, ALLOW_ENTITLEMENT);

  await service.enqueueRematch("user-1");
  await service.enqueueRematch("user-1");

  assert.equal(db.getMatchJobs().size, 1);
  assert.equal(db.getMatchJobs().get("user-1")?.status, "PENDING");
});

test("ensureMonitorInitialized is a no-op for a user without Monitor entitlement — never enqueues work", async () => {
  const db = createDb(buildProfile());
  const service = new MonitorProfileMatchServiceCtor(db, DENY_ENTITLEMENT);

  await service.ensureMonitorInitialized("user-1");

  assert.equal(db.getMatchJobs().size, 0);
});

test("enqueueRematch is a no-op for a user without Monitor entitlement — never enqueues work, never touches the profile", async () => {
  const profile = buildProfile({
    lastMatchedAt: new Date(),
    matchFingerprint: "stale-fingerprint",
  });
  const db = createDb(profile);
  const service = new MonitorProfileMatchServiceCtor(db, DENY_ENTITLEMENT);

  await service.enqueueRematch("user-1");

  assert.equal(db.getMatchJobs().size, 0);
  assert.equal(db.getProfileUpdates().length, 0);
});
