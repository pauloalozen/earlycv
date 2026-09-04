import assert from "node:assert/strict";
import { test } from "node:test";

import { MonitorDigestScheduler } from "./monitor-digest.scheduler";

type DigestKey = string;

function keyOf(userId: string, frequency: string, scheduledFor: Date) {
  return `${userId}:${frequency}:${scheduledFor.toISOString()}`;
}

function createFixture() {
  const preferences = new Map<
    string,
    { userId: string; emailEnabled: boolean; frequency: string }
  >();
  const digests = new Map<
    DigestKey,
    {
      id: string;
      userId: string;
      frequency: string;
      scheduledFor: Date;
      status: string;
    }
  >();
  const eligibleByUser = new Map<string, { id: string }[]>();
  let nextDigestId = 1;

  const database = {
    monitorAlertPreference: {
      findMany: async ({
        where,
      }: {
        where: { emailEnabled: boolean; frequency: string };
      }) =>
        Array.from(preferences.values()).filter(
          (p) =>
            p.emailEnabled === where.emailEnabled &&
            p.frequency === where.frequency,
        ),
    },
    monitorDigest: {
      findUnique: async ({
        where,
      }: {
        where: {
          userId_frequency_scheduledFor: {
            userId: string;
            frequency: string;
            scheduledFor: Date;
          };
        };
      }) => {
        const { userId, frequency, scheduledFor } =
          where.userId_frequency_scheduledFor;
        return digests.get(keyOf(userId, frequency, scheduledFor)) ?? null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `digest-${nextDigestId++}`;
        const record = {
          id,
          userId: data.userId as string,
          frequency: data.frequency as string,
          scheduledFor: data.scheduledFor as Date,
          status: data.status as string,
        };
        digests.set(
          keyOf(record.userId, record.frequency, record.scheduledFor),
          record,
        );
        return record;
      },
    },
  };

  const lockRepository = {
    acquire: async () => true,
    release: async () => undefined,
  };

  const contentService = {
    getEligibleRecommendations: async (userId: string) =>
      eligibleByUser.get(userId) ?? [],
  };

  let deniedUserIds = new Set<string>();
  const entitlementService = {
    filterEntitledUserIds: async (userIds: string[]) =>
      new Set(userIds.filter((id) => !deniedUserIds.has(id))),
  };

  const scheduler = new MonitorDigestScheduler(
    database as never,
    lockRepository as never,
    contentService as never,
    entitlementService as never,
  );

  return {
    database,
    digests,
    eligibleByUser,
    preferences,
    scheduler,
    setDeniedUserIds(userIds: string[]) {
      deniedUserIds = new Set(userIds);
    },
    seedPreference(
      userId: string,
      overrides: Partial<{ emailEnabled: boolean; frequency: string }> = {},
    ) {
      preferences.set(userId, {
        userId,
        emailEnabled: true,
        frequency: "DAILY",
        ...overrides,
      });
    },
    seedEligible(userId: string, count: number) {
      eligibleByUser.set(
        userId,
        Array.from({ length: count }, (_, i) => ({ id: `rec-${userId}-${i}` })),
      );
    },
  };
}

test("DAILY user with eligible recommendations gets a PENDING digest for today", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 3);

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
  );

  assert.equal(result.daily, 1);
  const [digest] = Array.from(fixture.digests.values());
  assert.equal(digest.status, "PENDING");
  assert.equal(digest.frequency, "DAILY");
});

test("DAILY user with no eligible recommendations gets a SKIPPED digest, not PENDING", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  // sem seedEligible — zero elegíveis

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
  );

  assert.equal(result.daily, 0);
  const [digest] = Array.from(fixture.digests.values());
  assert.equal(digest.status, "SKIPPED");
});

test("running discoverDue twice for the same day never creates a second digest for the same user (idempotent)", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 2);

  await fixture.scheduler.discoverDue(new Date("2026-08-27T13:00:00Z"));
  // Segunda "vaga" aparece depois — não deveria gerar um segundo digest
  // pro mesmo dia mesmo assim.
  fixture.seedEligible("user-1", 5);
  await fixture.scheduler.discoverDue(new Date("2026-08-27T14:00:00Z"));

  assert.equal(fixture.digests.size, 1);
});

test("WEEKLY users are only processed on the weekly anchor day (Monday)", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-weekly", { frequency: "WEEKLY" });
  fixture.seedEligible("user-weekly", 2);

  // Quinta-feira — não é dia de WEEKLY.
  const notMonday = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
  );
  assert.equal(notMonday.weekly, 0);
  assert.equal(fixture.digests.size, 0);

  // Segunda-feira — processa.
  const monday = await fixture.scheduler.discoverDue(
    new Date("2026-08-24T13:00:00Z"),
  );
  assert.equal(monday.weekly, 1);
});

test("a user with frequency OFF is never picked up (not in either DAILY or WEEKLY query)", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-off", { frequency: "OFF" });
  fixture.seedEligible("user-off", 3);

  await fixture.scheduler.discoverDue(new Date("2026-08-24T13:00:00Z"));

  assert.equal(fixture.digests.size, 0);
});

test("a user with emailEnabled=false is never picked up even with frequency=DAILY", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-disabled", { emailEnabled: false });
  fixture.seedEligible("user-disabled", 3);

  await fixture.scheduler.discoverDue(new Date("2026-08-27T13:00:00Z"));

  assert.equal(fixture.digests.size, 0);
});

test("a user without Monitor entitlement is never picked up, even with DAILY + eligible recommendations", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 3);
  fixture.setDeniedUserIds(["user-1"]);

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
  );

  assert.equal(result.daily, 0);
  assert.equal(fixture.digests.size, 0);
});
