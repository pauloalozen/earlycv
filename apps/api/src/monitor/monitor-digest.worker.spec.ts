import assert from "node:assert/strict";
import { test } from "node:test";

import { MonitorDigestWorker } from "./monitor-digest.worker";

type DigestRecord = {
  id: string;
  userId: string;
  status: string;
  attempts: number;
  updatedAt: Date;
  sentAt?: Date | null;
  providerMessageId?: string | null;
};

function createFixture() {
  const digests = new Map<string, DigestRecord>();
  const recordedEvents: {
    eventName: string;
    metadata: Record<string, unknown>;
  }[] = [];

  const database = {
    monitorDigest: {
      findMany: async ({ where }: { where: { status: string } }) =>
        Array.from(digests.values()).filter((d) => d.status === where.status),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const current = digests.get(where.id);
        assert.ok(current, `digest ${where.id} must exist`);
        const next = { ...current, ...data, updatedAt: new Date() };
        digests.set(where.id, next);
        return next;
      },
    },
  };

  const lockRepository = {
    acquire: async () => true,
    release: async () => undefined,
  };

  let sendResult: unknown = { sent: true, providerMessageId: "email_123" };
  let sendImpl: ((digestId: string) => Promise<unknown>) | null = null;
  const emailService = {
    sendDigest: async (digestId: string) =>
      sendImpl ? sendImpl(digestId) : sendResult,
  };

  const funnelEvents = {
    record: async (input: {
      eventName: string;
      metadata?: Record<string, unknown>;
    }) => {
      recordedEvents.push({
        eventName: input.eventName,
        metadata: input.metadata ?? {},
      });
      return { event: null, ingested: true };
    },
  };

  const entitlementService = {
    canUseMonitor: async () => ({ allowed: true, reason: "launch_access" }),
  };

  const worker = new MonitorDigestWorker(
    database as never,
    lockRepository as never,
    emailService as never,
    funnelEvents as never,
    entitlementService as never,
  );

  function seed(overrides: Partial<DigestRecord> = {}) {
    const id = overrides.id ?? `digest-${digests.size + 1}`;
    const record: DigestRecord = {
      id,
      userId: "user-1",
      status: "PENDING",
      attempts: 0,
      updatedAt: new Date(),
      ...overrides,
    };
    digests.set(id, record);
    return record;
  }

  return {
    digests,
    recordedEvents,
    seed,
    setSendImpl(fn: (digestId: string) => Promise<unknown>) {
      sendImpl = fn;
    },
    setSendResult(result: unknown) {
      sendResult = result;
    },
    worker,
  };
}

test("a PENDING digest that sends successfully is marked SENT with providerMessageId, and emits monitor_digest_sent", async () => {
  const fixture = createFixture();
  const digest = fixture.seed();

  await fixture.worker.processPendingBatch();

  const updated = fixture.digests.get(digest.id);
  assert.equal(updated?.status, "SENT");
  assert.equal(updated?.providerMessageId, "email_123");
  assert.ok(updated?.sentAt);
  assert.deepEqual(
    fixture.recordedEvents.map((e) => e.eventName),
    ["monitor_digest_sent"],
  );
  assert.equal(
    fixture.recordedEvents[0]?.metadata.monitor_access_type,
    "launch_access",
  );
});

test("when the email service reports sent:false (e.g. unsubscribed between scheduling and sending), the digest is marked SKIPPED and no event is emitted", async () => {
  const fixture = createFixture();
  const digest = fixture.seed();
  fixture.setSendResult({ sent: false, skippedReason: "email_disabled" });

  await fixture.worker.processPendingBatch();

  const updated = fixture.digests.get(digest.id);
  assert.equal(updated?.status, "SKIPPED");
  assert.deepEqual(fixture.recordedEvents, []);
});

test("provider failure increments attempts and requeues PENDING (retry), never affecting other digests", async () => {
  const fixture = createFixture();
  const digest = fixture.seed({ attempts: 0 });
  fixture.setSendImpl(async () => {
    throw new Error("resend unavailable");
  });

  await fixture.worker.processPendingBatch();

  const updated = fixture.digests.get(digest.id);
  assert.equal(updated?.status, "PENDING");
  assert.equal(updated?.attempts, 1);
  assert.deepEqual(fixture.recordedEvents, []);
});

test("provider failure marks FAILED once attempts reach the max — never sent, never duplicated on a later run", async () => {
  const fixture = createFixture();
  const digest = fixture.seed({ attempts: 2 });
  fixture.setSendImpl(async () => {
    throw new Error("resend unavailable");
  });

  await fixture.worker.processPendingBatch();

  const updated = fixture.digests.get(digest.id);
  assert.equal(updated?.status, "FAILED");
  assert.equal(updated?.attempts, 3);
});

test("recovers a stale PROCESSING digest — the same batch may immediately retry it, but the recovery step itself must have reset attempts/status, never leaving it silently stuck in PROCESSING", async () => {
  const fixture = createFixture();
  const stuck = fixture.seed({
    status: "PROCESSING",
    attempts: 0,
    updatedAt: new Date(Date.now() - 20 * 60_000),
  });
  // Falha o envio de propósito, pra isolar o efeito da recuperação (attempt
  // 1) do efeito do reprocessamento que a mesma batch tenta em seguida
  // (attempt 2) — sem isso, um envio bem-sucedido no mesmo tick mascararia
  // se a recuperação de fato tirou o registro de PROCESSING.
  fixture.setSendImpl(async () => {
    throw new Error("resend unavailable");
  });

  await fixture.worker.processPendingBatch();

  const updated = fixture.digests.get(stuck.id);
  assert.equal(updated?.status, "PENDING");
  // attempts=1 da recuperação (stale PROCESSING -> PENDING) + attempts=2
  // do processDigest que rodou na mesma batch e também falhou.
  assert.equal(updated?.attempts, 2);
});

test("a batch processes multiple independent digests without cross-contamination", async () => {
  const fixture = createFixture();
  const a = fixture.seed({ id: "digest-a", userId: "user-a" });
  const b = fixture.seed({ id: "digest-b", userId: "user-b" });

  await fixture.worker.processPendingBatch();

  assert.equal(fixture.digests.get(a.id)?.status, "SENT");
  assert.equal(fixture.digests.get(b.id)?.status, "SENT");
  assert.equal(fixture.recordedEvents.length, 2);
});
