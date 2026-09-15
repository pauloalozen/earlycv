import assert from "node:assert/strict";
import { test } from "node:test";

import { ProductUpdateSubscriptionService } from "./product-update-subscription.service";

type FakeUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  internalRole: string;
};

function createFixture(users: FakeUser[]) {
  const subscriptions = new Map<
    string,
    {
      subscribed: boolean;
      unsubscribedAt: Date | null;
      suppressionReason: string | null;
    }
  >();

  // Emula o where do Prisma o suficiente pro que o service de fato gera —
  // não é um mock do Prisma inteiro, só o subconjunto usado aqui.
  function matches(user: FakeUser, where: Record<string, unknown>): boolean {
    if (where.status && user.status !== where.status) return false;
    const roleFilter = where.internalRole as { in: string[] } | undefined;
    if (roleFilter && !roleFilter.in.includes(user.internalRole)) return false;
    const and = (where.AND ?? []) as Array<{
      OR: Array<Record<string, unknown>>;
    }>;
    for (const clause of and) {
      const ok = clause.OR.some((option) => {
        if (option.productEmailSubscription === null) {
          return !subscriptions.has(user.id);
        }
        const sub = option.productEmailSubscription as
          | { subscribed: boolean }
          | undefined;
        if (sub) {
          const current = subscriptions.get(user.id);
          return current?.subscribed === sub.subscribed;
        }
        return false;
      });
      if (!ok) return false;
    }
    return true;
  }

  const database = {
    user: {
      count: async ({ where }: { where: Record<string, unknown> }) =>
        users.filter((u) => matches(u, where)).length,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        users.filter((u) => matches(u, where)),
      findUnique: async ({ where }: { where: { email: string } }) => {
        const user = users.find((u) => u.email === where.email);
        return user ? { id: user.id } : null;
      },
    },
    productEmailSubscription: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = subscriptions.get(where.userId);
        const data = existing
          ? { ...existing, ...update }
          : {
              subscribed: true,
              unsubscribedAt: null,
              suppressionReason: null,
              ...create,
            };
        subscriptions.set(where.userId, data as never);
        return data;
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste, não o Prisma inteiro
  } as any;

  return { database, subscriptions };
}

const ACTIVE_USER: FakeUser = {
  id: "user-1",
  email: "user1@example.com",
  name: "Usuário Um",
  status: "active",
  internalRole: "none",
};
const SUSPENDED_USER: FakeUser = {
  id: "user-2",
  email: "user2@example.com",
  name: "Usuário Dois",
  status: "suspended",
  internalRole: "none",
};
const ADMIN_USER: FakeUser = {
  id: "admin-1",
  email: "admin1@example.com",
  name: "Admin Um",
  status: "active",
  internalRole: "admin",
};

test("resolveEligibleRecipients(ALL_ELIGIBLE_USERS) includes active users without an explicit opt-out — default é optado", async () => {
  const { database } = createFixture([ACTIVE_USER, SUSPENDED_USER, ADMIN_USER]);
  const service = new ProductUpdateSubscriptionService(database);

  const recipients =
    await service.resolveEligibleRecipients("ALL_ELIGIBLE_USERS");

  assert.deepEqual(recipients.map((r) => r.userId).sort(), [
    "admin-1",
    "user-1",
  ]);
});

test("resolveEligibleRecipients(ALL_ELIGIBLE_USERS) excludes a user after markSuppressed", async () => {
  const { database } = createFixture([ACTIVE_USER]);
  const service = new ProductUpdateSubscriptionService(database);

  await service.markSuppressed(ACTIVE_USER.id, "SES_OPT_OUT", new Date());

  const recipients =
    await service.resolveEligibleRecipients("ALL_ELIGIBLE_USERS");
  assert.deepEqual(recipients, []);
});

test("markResubscribed reverses a previous suppression", async () => {
  const { database } = createFixture([ACTIVE_USER]);
  const service = new ProductUpdateSubscriptionService(database);

  await service.markSuppressed(ACTIVE_USER.id, "BOUNCED", new Date());
  assert.deepEqual(
    await service.resolveEligibleRecipients("ALL_ELIGIBLE_USERS"),
    [],
  );

  await service.markResubscribed(ACTIVE_USER.id);
  const recipients =
    await service.resolveEligibleRecipients("ALL_ELIGIBLE_USERS");
  assert.equal(recipients.length, 1);
  assert.equal(recipients[0]?.userId, ACTIVE_USER.id);
});

test("resolveEligibleRecipients(INTERNAL_TEST) só inclui admin/superadmin ativos", async () => {
  const { database } = createFixture([ACTIVE_USER, ADMIN_USER, SUSPENDED_USER]);
  const service = new ProductUpdateSubscriptionService(database);

  const recipients = await service.resolveEligibleRecipients("INTERNAL_TEST");
  assert.deepEqual(
    recipients.map((r) => r.userId),
    ["admin-1"],
  );
});

test("countEligibleRecipients matches resolveEligibleRecipients length — mesma fonte de verdade", async () => {
  const { database } = createFixture([ACTIVE_USER, ADMIN_USER, SUSPENDED_USER]);
  const service = new ProductUpdateSubscriptionService(database);

  const count = await service.countEligibleRecipients("ALL_ELIGIBLE_USERS");
  const recipients =
    await service.resolveEligibleRecipients("ALL_ELIGIBLE_USERS");
  assert.equal(count, recipients.length);
});
