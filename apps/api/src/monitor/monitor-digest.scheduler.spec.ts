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
    { userId: string; emailEnabled: boolean }
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
  const users = new Map<
    string,
    { id: string; internalRole: string; isPaid: boolean }
  >();
  let nextDigestId = 1;

  const database = {
    monitorAlertPreference: {
      findMany: async ({ where }: { where: { emailEnabled: boolean } }) =>
        Array.from(preferences.values()).filter(
          (p) => p.emailEnabled === where.emailEnabled,
        ),
    },
    user: {
      findMany: async ({
        where,
      }: {
        where: {
          internalRole?: { in: string[] };
          planPurchases?: { some: { status: string } };
        };
      }) => {
        const all = Array.from(users.values());
        const matching = where.internalRole
          ? all.filter((u) => where.internalRole?.in.includes(u.internalRole))
          : all.filter((u) => u.isPaid);
        return matching.map((u) => ({ id: u.id }));
      },
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

  // Default true + sesRolloutSegment="ALL" nos testes legados (que não são
  // sobre SES) — testes específicos de coorte abaixo chamam
  // setSesEnabled(...) explicitamente para os cenários que importam.
  let sesEnabled = true;
  const emailConfig = {
    isSesEnabled: () => sesEnabled,
  };

  const scheduler = new MonitorDigestScheduler(
    database as never,
    lockRepository as never,
    contentService as never,
    entitlementService as never,
    emailConfig as never,
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
    setSesEnabled(enabled: boolean) {
      sesEnabled = enabled;
    },
    seedUser(
      id: string,
      overrides: Partial<{ internalRole: string; isPaid: boolean }> = {},
    ) {
      users.set(id, {
        id,
        internalRole: "none",
        isPaid: false,
        ...overrides,
      });
    },
    seedPreference(
      userId: string,
      overrides: Partial<{ emailEnabled: boolean }> = {},
    ) {
      preferences.set(userId, {
        userId,
        emailEnabled: true,
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

// Cadência é global agora (MonitorDigestScheduleConfig.frequency) — todos
// os usuários com email ligado são descobertos juntos, numa única
// passada. Não existe mais granularidade por usuário (ver
// MonitorAlertPreference, que só guarda emailEnabled).

test("DAILY: user with eligible recommendations gets a PENDING digest for today", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 3);

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesRolloutSegment: "ALL" },
  );

  assert.equal(result.created, 1);
  const [digest] = Array.from(fixture.digests.values());
  assert.equal(digest.status, "PENDING");
  assert.equal(digest.frequency, "DAILY");
});

test("DAILY: user with no eligible recommendations gets a SKIPPED digest, not PENDING", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  // sem seedEligible — zero elegíveis

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesRolloutSegment: "ALL" },
  );

  assert.equal(result.created, 0);
  const [digest] = Array.from(fixture.digests.values());
  assert.equal(digest.status, "SKIPPED");
});

test("running discoverDue twice for the same day never creates a second digest for the same user (idempotent)", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 2);

  await fixture.scheduler.discoverDue(new Date("2026-08-27T13:00:00Z"), {
    frequency: "DAILY",
    sesRolloutSegment: "ALL",
  });
  // Segunda "vaga" aparece depois — não deveria gerar um segundo digest
  // pro mesmo dia mesmo assim.
  fixture.seedEligible("user-1", 5);
  await fixture.scheduler.discoverDue(new Date("2026-08-27T14:00:00Z"), {
    frequency: "DAILY",
    sesRolloutSegment: "ALL",
  });

  assert.equal(fixture.digests.size, 1);
});

test("WEEKLY: creates a digest scoped to the Monday of the ISO week (scheduledForNow)", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-weekly");
  fixture.seedEligible("user-weekly", 2);

  // Quinta-feira — MonitorDigestScheduler.tick() já teria filtrado por
  // isFrequencyDueToday antes de chegar aqui; discoverDue por si só só
  // decide o scheduledFor, não se hoje é dia de WEEKLY.
  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "WEEKLY", sesRolloutSegment: "ALL" },
  );

  assert.equal(result.created, 1);
  const [digest] = Array.from(fixture.digests.values());
  assert.equal(digest.frequency, "WEEKLY");
  assert.equal(digest.scheduledFor.toISOString(), "2026-08-24T00:00:00.000Z");
});

test("EVERY_3_DAYS: creates a digest scoped to the current UTC day, same as DAILY", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 1);

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "EVERY_3_DAYS", sesRolloutSegment: "ALL" },
  );

  assert.equal(result.created, 1);
  const [digest] = Array.from(fixture.digests.values());
  assert.equal(digest.frequency, "EVERY_3_DAYS");
  assert.equal(digest.scheduledFor.toISOString(), "2026-08-27T00:00:00.000Z");
});

test("a user with emailEnabled=false is never picked up, regardless of the global frequency", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-disabled", { emailEnabled: false });
  fixture.seedEligible("user-disabled", 3);

  await fixture.scheduler.discoverDue(new Date("2026-08-27T13:00:00Z"), {
    frequency: "DAILY",
    sesRolloutSegment: "ALL",
  });

  assert.equal(fixture.digests.size, 0);
});

test("a user without Monitor entitlement is never picked up, even with eligible recommendations", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 3);
  fixture.setDeniedUserIds(["user-1"]);

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesRolloutSegment: "ALL" },
  );

  assert.equal(result.created, 0);
  assert.equal(fixture.digests.size, 0);
});

test("multiple enabled users are all discovered together under the same global frequency", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedPreference("user-2");
  fixture.seedEligible("user-1", 2);
  fixture.seedEligible("user-2", 1);

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesRolloutSegment: "ALL" },
  );

  assert.equal(result.created, 2);
  assert.equal(fixture.digests.size, 2);
});

// Coorte controlada do rollout SES (MonitorDigestScheduleConfig.
// sesRolloutSegment) — sem relação com o teto do Resend: aqui é sobre
// QUEM gera um MonitorDigest de verdade nesta fase controlada. Fora da
// coorte = SKIPPED direto, nunca PENDING (nunca cai pro Resend).

test("sesRolloutSegment=null (default seguro): ninguém recebe, mesmo com SES ligado e usuário elegível", async () => {
  const fixture = createFixture();
  fixture.setSesEnabled(true);
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 3);
  fixture.seedUser("user-1");

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesRolloutSegment: null },
  );

  assert.equal(result.created, 0);
  const [digest] = Array.from(fixture.digests.values());
  assert.equal(digest.status, "SKIPPED");
});

test("SES_EMAIL_ENABLED=false: ninguém recebe mesmo com sesRolloutSegment=ALL configurado", async () => {
  const fixture = createFixture();
  fixture.setSesEnabled(false);
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 3);
  fixture.seedUser("user-1");

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesRolloutSegment: "ALL" },
  );

  assert.equal(result.created, 0);
  const [digest] = Array.from(fixture.digests.values());
  assert.equal(digest.status, "SKIPPED");
});

test("sesRolloutSegment=INTERNAL: só User.internalRole IN (admin, superadmin) entra na coorte", async () => {
  const fixture = createFixture();
  fixture.setSesEnabled(true);
  fixture.seedPreference("user-admin");
  fixture.seedPreference("user-regular");
  fixture.seedEligible("user-admin", 1);
  fixture.seedEligible("user-regular", 1);
  fixture.seedUser("user-admin", { internalRole: "admin" });
  fixture.seedUser("user-regular", { internalRole: "none" });

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesRolloutSegment: "INTERNAL" },
  );

  assert.equal(result.created, 1);
  const admin = fixture.digests.get(
    "user-admin:DAILY:2026-08-27T00:00:00.000Z",
  );
  const regular = fixture.digests.get(
    "user-regular:DAILY:2026-08-27T00:00:00.000Z",
  );
  assert.equal(admin?.status, "PENDING");
  assert.equal(regular?.status, "SKIPPED");
});

test("sesRolloutSegment=PAID: só usuário com planPurchase completed entra na coorte", async () => {
  const fixture = createFixture();
  fixture.setSesEnabled(true);
  fixture.seedPreference("user-paid");
  fixture.seedPreference("user-free");
  fixture.seedEligible("user-paid", 1);
  fixture.seedEligible("user-free", 1);
  fixture.seedUser("user-paid", { isPaid: true });
  fixture.seedUser("user-free", { isPaid: false });

  await fixture.scheduler.discoverDue(new Date("2026-08-27T13:00:00Z"), {
    frequency: "DAILY",
    sesRolloutSegment: "PAID",
  });

  const paid = fixture.digests.get("user-paid:DAILY:2026-08-27T00:00:00.000Z");
  const free = fixture.digests.get("user-free:DAILY:2026-08-27T00:00:00.000Z");
  assert.equal(paid?.status, "PENDING");
  assert.equal(free?.status, "SKIPPED");
});

test("sesRolloutSegment=ALL: todo mundo elegível entra, sem consultar User (sentinela null economiza a query)", async () => {
  const fixture = createFixture();
  fixture.setSesEnabled(true);
  fixture.seedPreference("user-1");
  fixture.seedPreference("user-2");
  fixture.seedEligible("user-1", 1);
  fixture.seedEligible("user-2", 1);
  // Nenhum seedUser — se o código consultasse User pra ALL, encontraria
  // zero registros e o teste falharia.

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesRolloutSegment: "ALL" },
  );

  assert.equal(result.created, 2);
});
