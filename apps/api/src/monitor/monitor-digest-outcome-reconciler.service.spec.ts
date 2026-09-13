import assert from "node:assert/strict";
import { test } from "node:test";
import { OUTCOME_UNKNOWN_RECONCILIATION_WINDOW_MS } from "./monitor-digest.constants";
import { MonitorDigestOutcomeReconciler } from "./monitor-digest-outcome-reconciler.service";

type DigestRecord = {
  id: string;
  status: string;
  attempts: number;
  outcomeUnknownAt: Date | null;
};

function createFixture() {
  const digests = new Map<string, DigestRecord>();

  const database = {
    monitorDigest: {
      findMany: async ({
        where,
      }: {
        where: { status: string; outcomeUnknownAt: { lt: Date } };
      }) =>
        Array.from(digests.values()).filter(
          (d) =>
            d.status === where.status &&
            d.outcomeUnknownAt !== null &&
            d.outcomeUnknownAt < where.outcomeUnknownAt.lt,
        ),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const current = digests.get(where.id);
        assert.ok(current, `digest ${where.id} must exist`);
        const next = { ...current, ...data } as DigestRecord;
        digests.set(where.id, next);
        return next;
      },
    },
  };

  const lockRepository = {
    acquire: async () => true,
    release: async () => undefined,
  };

  const reconciler = new MonitorDigestOutcomeReconciler(
    database as never,
    lockRepository as never,
  );

  function seed(overrides: Partial<DigestRecord> = {}) {
    const id = overrides.id ?? `digest-${digests.size + 1}`;
    const record: DigestRecord = {
      id,
      status: "OUTCOME_UNKNOWN",
      attempts: 0,
      outcomeUnknownAt: new Date(
        Date.now() - OUTCOME_UNKNOWN_RECONCILIATION_WINDOW_MS - 60_000,
      ),
      ...overrides,
    };
    digests.set(id, record);
    return record;
  }

  return { digests, reconciler, seed };
}

test("requeues an OUTCOME_UNKNOWN digest to PENDING once the reconciliation window has elapsed with no confirming event", async () => {
  const fixture = createFixture();
  const digest = fixture.seed({ attempts: 0 });

  const result = await fixture.reconciler.reconcile();

  const updated = fixture.digests.get(digest.id);
  assert.equal(result.requeued, 1);
  assert.equal(result.exhausted, 0);
  assert.equal(updated?.status, "PENDING");
  assert.equal(updated?.attempts, 1);
  assert.equal(updated?.outcomeUnknownAt, null);
});

test("never touches an OUTCOME_UNKNOWN digest still inside the reconciliation window", async () => {
  const fixture = createFixture();
  const digest = fixture.seed({ outcomeUnknownAt: new Date() });

  const result = await fixture.reconciler.reconcile();

  const updated = fixture.digests.get(digest.id);
  assert.equal(result.requeued, 0);
  assert.equal(updated?.status, "OUTCOME_UNKNOWN");
  assert.equal(updated?.attempts, 0);
});

test("stops requeuing once the shared retry budget is exhausted — stays OUTCOME_UNKNOWN permanently for manual resend", async () => {
  const fixture = createFixture();
  const digest = fixture.seed({ attempts: 2 });

  const result = await fixture.reconciler.reconcile();

  const updated = fixture.digests.get(digest.id);
  assert.equal(result.requeued, 0);
  assert.equal(result.exhausted, 1);
  assert.equal(updated?.status, "OUTCOME_UNKNOWN");
  assert.equal(updated?.attempts, 3);
});
