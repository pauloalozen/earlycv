import assert from "node:assert/strict";
import { test } from "node:test";

import { AnalysisDedupeCacheService } from "./analysis-dedupe-cache.service";
import { InMemoryOperationalStoreAdapter } from "./store/in-memory-operational-store.adapter";
import type { AnalysisRequestContext } from "./types";

const makeContext = (
  overrides: Partial<AnalysisRequestContext> = {},
): AnalysisRequestContext => ({
  correlationId: "corr-1",
  ip: "203.0.113.10",
  requestId: "req-1",
  sessionInternalId: "session-1",
  sessionPublicToken: null,
  userId: null,
  ...overrides,
});

test("dedupe lock uses setNx semantics for concurrent protection", async () => {
  const store = new InMemoryOperationalStoreAdapter();
  const service = new AnalysisDedupeCacheService(store);
  const context = makeContext();

  const first = await service.tryAcquireLock(context, "hash-1");
  const second = await service.tryAcquireLock(context, "hash-1");

  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);

  await service.releaseLock(context, "hash-1");

  const afterRelease = await service.tryAcquireLock(context, "hash-1");

  assert.equal(afterRelease.acquired, true);
});

test("release lock ignores stale owner token", async () => {
  let now = 0;
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisDedupeCacheService(store, () => now);
  const ownerA = makeContext({ requestId: "req-a" });
  const ownerB = makeContext({ requestId: "req-b" });

  const first = await service.tryAcquireLock(ownerA, "hash-race", 10);
  assert.equal(first.acquired, true);

  now = 11;

  const second = await service.tryAcquireLock(ownerB, "hash-race", 10_000);
  assert.equal(second.acquired, true);

  await service.releaseLock(ownerA, "hash-race");

  const third = await service.tryAcquireLock(
    makeContext({ requestId: "req-c" }),
    "hash-race",
    10_000,
  );
  assert.equal(third.acquired, false);

  await service.releaseLock(ownerB, "hash-race");

  const afterOwnerRelease = await service.tryAcquireLock(
    makeContext({ requestId: "req-d" }),
    "hash-race",
    10_000,
  );
  assert.equal(afterOwnerRelease.acquired, true);
});

test("cache entries are isolated by user/session scope", async () => {
  const store = new InMemoryOperationalStoreAdapter();
  const service = new AnalysisDedupeCacheService(store);
  const sessionA = makeContext({
    requestId: "req-a",
    sessionInternalId: "s-a",
  });
  const sessionB = makeContext({
    requestId: "req-b",
    sessionInternalId: "s-b",
  });

  await service.setCachedResult(sessionA, "hash-1", { ok: true }, 30_000);

  const fromA = await service.getCachedResult(sessionA, "hash-1");
  const fromB = await service.getCachedResult(sessionB, "hash-1");

  assert.deepEqual(fromA, { ok: true });
  assert.equal(fromB, null);
});

test("dedupe lock isolation allows same hash in different sessions", async () => {
  const store = new InMemoryOperationalStoreAdapter();
  const service = new AnalysisDedupeCacheService(store);
  const sessionA = makeContext({
    requestId: "req-a",
    sessionInternalId: "s-a",
  });
  const sessionB = makeContext({
    requestId: "req-b",
    sessionInternalId: "s-b",
  });

  const lockA = await service.tryAcquireLock(sessionA, "hash-1");
  const lockB = await service.tryAcquireLock(sessionB, "hash-1");

  assert.equal(lockA.acquired, true);
  assert.equal(lockB.acquired, true);
});

test("dedupe lock scope for anonymous sessions includes ip", async () => {
  const store = new InMemoryOperationalStoreAdapter();
  const service = new AnalysisDedupeCacheService(store);
  const sameSessionDifferentIpA = makeContext({
    requestId: "req-a",
    sessionInternalId: "session-shared",
    userId: null,
    ip: "198.51.100.10",
  });
  const sameSessionDifferentIpB = makeContext({
    requestId: "req-b",
    sessionInternalId: "session-shared",
    userId: null,
    ip: "198.51.100.11",
  });

  const first = await service.tryAcquireLock(
    sameSessionDifferentIpA,
    "hash-scope",
  );
  const second = await service.tryAcquireLock(
    sameSessionDifferentIpB,
    "hash-scope",
  );

  assert.equal(first.acquired, true);
  assert.equal(second.acquired, true);
});

test("anonymous lock scope is stable and not request-id based", async () => {
  const store = new InMemoryOperationalStoreAdapter();
  const service = new AnalysisDedupeCacheService(store);
  const firstRequest = makeContext({
    requestId: "req-1",
    userId: null,
    sessionInternalId: null,
    sessionPublicToken: null,
    ip: null,
  });
  const secondRequest = makeContext({
    requestId: "req-2",
    userId: null,
    sessionInternalId: null,
    sessionPublicToken: null,
    ip: null,
  });

  const first = await service.tryAcquireLock(firstRequest, "hash-unknown");
  const second = await service.tryAcquireLock(secondRequest, "hash-unknown");

  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
});

test("canonical hash is stable across key order", () => {
  const service = new AnalysisDedupeCacheService(
    new InMemoryOperationalStoreAdapter(),
  );

  const first = service.buildCanonicalHash({ b: 2, a: [3, { z: 1, y: 2 }] });
  const second = service.buildCanonicalHash({ a: [3, { y: 2, z: 1 }], b: 2 });

  assert.equal(first, second);
});

test("canonical hash changes when payload meaningfully changes", () => {
  const service = new AnalysisDedupeCacheService(
    new InMemoryOperationalStoreAdapter(),
  );

  const first = service.buildCanonicalHash({ a: 1, b: 2 });
  const second = service.buildCanonicalHash({ a: 1, b: 3 });

  assert.notEqual(first, second);
});

test("anti-bot heuristic blocks repeated same hash in short interval", async () => {
  let now = 5_000;
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisDedupeCacheService(store, () => now);
  const context = makeContext({ requestId: "req-abuse" });
  const canonicalHash = "hash-spam";

  const first = await service.checkAntiBotHeuristic(context, canonicalHash, {
    repetitionThreshold: 3,
    shortIntervalMs: 1_000,
  });
  now += 100;
  const second = await service.checkAntiBotHeuristic(context, canonicalHash, {
    repetitionThreshold: 3,
    shortIntervalMs: 1_000,
  });
  now += 100;
  const third = await service.checkAntiBotHeuristic(context, canonicalHash, {
    repetitionThreshold: 3,
    shortIntervalMs: 1_000,
  });

  assert.equal(first.blocked, false);
  assert.equal(second.blocked, false);
  assert.equal(third.blocked, true);
});

test("anti-bot heuristic resets count after long interval", async () => {
  let now = 10_000;
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisDedupeCacheService(store, () => now);
  const context = makeContext({ requestId: "req-reset" });
  const canonicalHash = "hash-reset";

  await service.checkAntiBotHeuristic(context, canonicalHash, {
    repetitionThreshold: 2,
    shortIntervalMs: 500,
  });

  now += 1_000;

  const afterInterval = await service.checkAntiBotHeuristic(
    context,
    canonicalHash,
    {
      repetitionThreshold: 2,
      shortIntervalMs: 500,
    },
  );

  assert.equal(afterInterval.blocked, false);
});
