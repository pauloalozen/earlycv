import assert from "node:assert/strict";
import { test } from "node:test";

import { AnalysisRateLimitService } from "./analysis-rate-limit.service";
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

test("raw rate limit blocks requests over configured limit", async () => {
  const now = 1_000;
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisRateLimitService(store, () => now);
  const context = makeContext();

  const first = await service.checkRawLimit(context, { rawLimitPerMinute: 2 });
  const second = await service.checkRawLimit(context, { rawLimitPerMinute: 2 });
  const third = await service.checkRawLimit(context, { rawLimitPerMinute: 2 });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.reason, "rate_limit_block_initial");
});

test("raw rate limit without ip uses shared unknown-ip bucket", async () => {
  const now = 1_000;
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisRateLimitService(store, () => now);

  const first = await service.checkRawLimit(
    makeContext({
      requestId: "req-anon-1",
      ip: null,
      userId: "user-a",
      sessionInternalId: "session-a",
    }),
    { rawLimitPerMinute: 1 },
  );
  const second = await service.checkRawLimit(
    makeContext({
      requestId: "req-anon-2",
      ip: null,
      userId: "user-b",
      sessionInternalId: "session-b",
    }),
    { rawLimitPerMinute: 1 },
  );

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.reason, "rate_limit_block_initial");
});

test("contextual rate limit is isolated by session scope", async () => {
  const now = 5_000;
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisRateLimitService(store, () => now);
  const sessionA = makeContext({
    requestId: "req-a",
    sessionInternalId: "s-a",
    ip: "203.0.113.10",
  });
  const sessionB = makeContext({
    requestId: "req-b",
    sessionInternalId: "s-b",
    ip: "203.0.113.11",
  });

  const aFirst = await service.checkContextualLimit(sessionA, {
    contextualLimitPerMinute: 1,
  });
  const bFirst = await service.checkContextualLimit(sessionB, {
    contextualLimitPerMinute: 1,
  });
  const aSecond = await service.checkContextualLimit(sessionA, {
    contextualLimitPerMinute: 1,
  });

  assert.equal(aFirst.allowed, true);
  assert.equal(bFirst.allowed, true);
  assert.equal(aSecond.allowed, false);
  assert.equal(aSecond.reason, "rate_limit_block_contextual");
});

test("contextual rate limit blocks when any configured dimension exceeds", async () => {
  const now = 5_000;
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisRateLimitService(store, () => now);

  await service.checkContextualLimit(
    makeContext({
      requestId: "seed-1",
      ip: "198.51.100.20",
      sessionInternalId: "session-seed",
      userId: "user-seed",
    }),
    { contextualLimitPerMinute: 1 },
  );

  const blockedByIp = await service.checkContextualLimit(
    makeContext({
      requestId: "req-2",
      ip: "198.51.100.20",
      sessionInternalId: "session-other",
      userId: "user-other",
    }),
    { contextualLimitPerMinute: 1 },
  );

  assert.equal(blockedByIp.allowed, false);
  assert.equal(blockedByIp.reason, "rate_limit_block_contextual");
});

test("contextual rate limit uses stable anonymous scope instead of request id", async () => {
  const now = 5_000;
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisRateLimitService(store, () => now);

  const first = await service.checkContextualLimit(
    makeContext({
      requestId: "req-1",
      userId: null,
      sessionInternalId: null,
      sessionPublicToken: null,
      ip: null,
    }),
    { contextualLimitPerMinute: 1 },
  );
  const second = await service.checkContextualLimit(
    makeContext({
      requestId: "req-2",
      userId: null,
      sessionInternalId: null,
      sessionPublicToken: null,
      ip: null,
    }),
    { contextualLimitPerMinute: 1 },
  );

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.reason, "rate_limit_block_contextual");
});
