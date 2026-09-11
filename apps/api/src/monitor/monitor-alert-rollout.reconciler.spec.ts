import assert from "node:assert/strict";
import { test } from "node:test";

import { MonitorAlertRolloutReconciler } from "./monitor-alert-rollout.reconciler";

type UserRow = {
  id: string;
  planPurchases: { status: string }[];
};

function createFixture(
  overrides: { lockAcquired?: boolean } = {},
) {
  const users = new Map<string, UserRow>();
  const preferences = new Map<string, { userId: string; emailEnabled: boolean }>();
  let policy: {
    active: boolean;
    segment: string;
    cutoffAt: Date | null;
  } | null = null;
  const actionLogs: { action: string; metadataJson: unknown }[] = [];
  let lastAppliedAt: Date | null = null;

  const database = {
    user: {
      findMany: async ({
        where,
      }: {
        where: {
          monitorAlertPreference: null;
          planPurchases?: { some: { status: string } };
        };
      }) => {
        return [...users.values()].filter((u) => {
          if (preferences.has(u.id)) return false; // já tem linha — nunca candidato
          if (where.planPurchases) {
            return u.planPurchases.some(
              (p) => p.status === where.planPurchases?.some.status,
            );
          }
          return true;
        });
      },
    },
    monitorAlertPreference: {
      createMany: async ({
        data,
      }: {
        data: { userId: string; emailEnabled: boolean }[];
      }) => {
        let count = 0;
        for (const row of data) {
          if (preferences.has(row.userId)) continue; // skipDuplicates
          preferences.set(row.userId, row);
          count += 1;
        }
        return { count };
      },
    },
    monitorAlertRolloutPolicy: {
      findUnique: async () => policy,
      update: async ({ data }: { data: { lastAppliedAt: Date } }) => {
        lastAppliedAt = data.lastAppliedAt;
        return { id: "default", ...policy, lastAppliedAt };
      },
    },
    monitorAdminActionLog: {
      create: async ({
        data,
      }: {
        data: { action: string; metadataJson: unknown };
      }) => {
        actionLogs.push({ action: data.action, metadataJson: data.metadataJson });
        return data;
      },
    },
  };

  const lockRepository = {
    acquire: async () => overrides.lockAcquired ?? true,
    release: async () => undefined,
  };

  const reconciler = new MonitorAlertRolloutReconciler(
    database as never,
    lockRepository as never,
  );

  return {
    actionLogs,
    reconciler,
    seedUser(id: string, overrides: { paid?: boolean } = {}) {
      users.set(id, {
        id,
        planPurchases: overrides.paid ? [{ status: "completed" }] : [],
      });
    },
    seedPreference(userId: string, emailEnabled: boolean) {
      preferences.set(userId, { userId, emailEnabled });
    },
    setPolicy(overrides: Partial<NonNullable<typeof policy>>) {
      policy = {
        active: false,
        segment: "ALL",
        cutoffAt: null,
        ...overrides,
      };
    },
    preferences,
  };
}

test("reconcile() não faz nada quando a política está inativa", async () => {
  const fixture = createFixture();
  fixture.seedUser("u1");
  fixture.setPolicy({ active: false });

  const result = await fixture.reconciler.reconcile();

  assert.equal(result.enrolledCount, 0);
  assert.equal(fixture.preferences.size, 0);
});

test("reconcile() não enrola ninguém depois do cutoffAt", async () => {
  const fixture = createFixture();
  fixture.seedUser("u1");
  fixture.setPolicy({
    active: true,
    segment: "ALL",
    cutoffAt: new Date(Date.now() - 60_000), // já passou
  });

  const result = await fixture.reconciler.reconcile();

  assert.equal(result.enrolledCount, 0);
  assert.equal(fixture.preferences.size, 0);
});

test("reconcile() segmento ALL enrola usuário sem linha nenhuma, e mantém quem já tem linha intocado", async () => {
  const fixture = createFixture();
  fixture.seedUser("new-user");
  fixture.seedUser("already-unsubscribed");
  fixture.seedPreference("already-unsubscribed", false);
  fixture.setPolicy({ active: true, segment: "ALL", cutoffAt: null });

  const result = await fixture.reconciler.reconcile();

  assert.equal(result.enrolledCount, 1);
  assert.equal(fixture.preferences.get("new-user")?.emailEnabled, true);
  // nunca sobrescreve quem já tinha linha, mesmo desativada
  assert.equal(
    fixture.preferences.get("already-unsubscribed")?.emailEnabled,
    false,
  );
  assert.equal(fixture.actionLogs[0]?.action, "alert_rollout_reconciled");
});

test("reconcile() segmento PAID só enrola usuário pagante sem linha", async () => {
  const fixture = createFixture();
  fixture.seedUser("paying-new", { paid: true });
  fixture.seedUser("free-new", { paid: false });
  fixture.setPolicy({ active: true, segment: "PAID", cutoffAt: null });

  const result = await fixture.reconciler.reconcile();

  assert.equal(result.enrolledCount, 1);
  assert.equal(fixture.preferences.has("paying-new"), true);
  assert.equal(fixture.preferences.has("free-new"), false);
});

test("reconcile() ignora lock ocupado (outra instância já está rodando)", async () => {
  const fixture = createFixture({ lockAcquired: false });
  fixture.seedUser("u1");
  fixture.setPolicy({ active: true, segment: "ALL", cutoffAt: null });

  const result = await fixture.reconciler.reconcile();
  assert.equal(result.enrolledCount, 0);
  assert.equal(fixture.preferences.size, 0);
});
