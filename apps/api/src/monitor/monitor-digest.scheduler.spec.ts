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
      lastError: string | null;
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
      // discoverForUser passou a usar findFirst (a chave só é única no
      // banco pra source=SCHEDULER, ver schema.prisma) — mesma busca por
      // igualdade exata nos 3 campos, este fake nunca teve múltiplas
      // linhas por chave mesmo.
      findFirst: async ({
        where,
      }: {
        where: { userId: string; frequency: string; scheduledFor: Date };
      }) => {
        const { userId, frequency, scheduledFor } = where;
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
          lastError: (data.lastError as string | undefined) ?? null,
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
//
// Nenhum destes testes passa sesMode/sesRolloutSegment — o default,
// LEGACY_RESEND, é exatamente o mesmo comportamento de antes do SES
// existir (todo elegível, sem coorte), então a mecânica de descoberta em
// si (frequência, idempotência, entitlement) é testada sem nenhum
// conhecimento de SES.

test("DAILY: user with eligible recommendations gets a PENDING digest for today", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 3);

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY" },
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
    { frequency: "DAILY" },
  );

  assert.equal(result.created, 0);
  const [digest] = Array.from(fixture.digests.values());
  assert.equal(digest.status, "SKIPPED");
  assert.equal(digest.lastError, null);
});

test("running discoverDue twice for the same day never creates a second digest for the same user (idempotent)", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 2);

  await fixture.scheduler.discoverDue(new Date("2026-08-27T13:00:00Z"), {
    frequency: "DAILY",
  });
  // Segunda "vaga" aparece depois — não deveria gerar um segundo digest
  // pro mesmo dia mesmo assim.
  fixture.seedEligible("user-1", 5);
  await fixture.scheduler.discoverDue(new Date("2026-08-27T14:00:00Z"), {
    frequency: "DAILY",
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
    { frequency: "WEEKLY" },
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
    { frequency: "EVERY_3_DAYS" },
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
    { frequency: "DAILY" },
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
    { frequency: "DAILY" },
  );

  assert.equal(result.created, 2);
  assert.equal(fixture.digests.size, 2);
});

// Modo operacional (EmailBulkSendMode) + coorte do rollout SES — sem
// relação com o teto do Resend em si: aqui é sobre QUEM gera um
// MonitorDigest PENDING de verdade em cada modo. Fora da coorte/pausado =
// SKIPPED direto, nunca PENDING (nunca cai pro Resend por fallback).

test("sesMode=LEGACY_RESEND (default): todo elegível entra, sem consultar User", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 1);
  // Nenhum seedUser — se o código consultasse User em LEGACY_RESEND,
  // encontraria zero registros e o teste falharia.

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesMode: "LEGACY_RESEND" },
  );

  assert.equal(result.created, 1);
});

test("sesMode=PAUSED: ninguém recebe, mesmo elegível — SKIPPED com lastError=ses_mode_paused", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 3);

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesMode: "PAUSED" },
  );

  assert.equal(result.created, 0);
  const [digest] = Array.from(fixture.digests.values());
  assert.equal(digest.status, "SKIPPED");
  assert.equal(digest.lastError, "ses_mode_paused");
});

test("sesMode=SES_ROLLOUT, sesRolloutSegment=null (default seguro): ninguém entra ainda", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 3);
  fixture.seedUser("user-1");

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesMode: "SES_ROLLOUT", sesRolloutSegment: null },
  );

  assert.equal(result.created, 0);
  const [digest] = Array.from(fixture.digests.values());
  assert.equal(digest.status, "SKIPPED");
  assert.equal(digest.lastError, "ses_rollout_outside_cohort");
});

test("sesMode=SES_ROLLOUT, sesRolloutSegment=INTERNAL: só User.internalRole IN (admin, superadmin) entra na coorte", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-admin");
  fixture.seedPreference("user-regular");
  fixture.seedEligible("user-admin", 1);
  fixture.seedEligible("user-regular", 1);
  fixture.seedUser("user-admin", { internalRole: "admin" });
  fixture.seedUser("user-regular", { internalRole: "none" });

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    {
      frequency: "DAILY",
      sesMode: "SES_ROLLOUT",
      sesRolloutSegment: "INTERNAL",
    },
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
  assert.equal(regular?.lastError, "ses_rollout_outside_cohort");
});

test("sesMode=SES_ROLLOUT, sesRolloutSegment=PAID: só usuário com planPurchase completed entra na coorte", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-paid");
  fixture.seedPreference("user-free");
  fixture.seedEligible("user-paid", 1);
  fixture.seedEligible("user-free", 1);
  fixture.seedUser("user-paid", { isPaid: true });
  fixture.seedUser("user-free", { isPaid: false });

  await fixture.scheduler.discoverDue(new Date("2026-08-27T13:00:00Z"), {
    frequency: "DAILY",
    sesMode: "SES_ROLLOUT",
    sesRolloutSegment: "PAID",
  });

  const paid = fixture.digests.get("user-paid:DAILY:2026-08-27T00:00:00.000Z");
  const free = fixture.digests.get("user-free:DAILY:2026-08-27T00:00:00.000Z");
  assert.equal(paid?.status, "PENDING");
  assert.equal(free?.status, "SKIPPED");
});

test("sesMode=SES_ROLLOUT, sesRolloutSegment=ALL: todo mundo elegível entra, sem consultar User", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedPreference("user-2");
  fixture.seedEligible("user-1", 1);
  fixture.seedEligible("user-2", 1);
  // Nenhum seedUser — se o código consultasse User pra ALL, encontraria
  // zero registros e o teste falharia.

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesMode: "SES_ROLLOUT", sesRolloutSegment: "ALL" },
  );

  assert.equal(result.created, 2);
});

test("sesMode=SES_LIVE: todo elegível entra, sesRolloutSegment é ignorado mesmo se setado", async () => {
  const fixture = createFixture();
  fixture.seedPreference("user-1");
  fixture.seedEligible("user-1", 1);
  // sesRolloutSegment=null propositalmente — SES_LIVE não deveria olhar
  // pra este campo de jeito nenhum.

  const result = await fixture.scheduler.discoverDue(
    new Date("2026-08-27T13:00:00Z"),
    { frequency: "DAILY", sesMode: "SES_LIVE", sesRolloutSegment: null },
  );

  assert.equal(result.created, 1);
});
