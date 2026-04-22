import assert from "node:assert/strict";
import { test } from "node:test";

import { AnalysisUsagePolicyService } from "./analysis-usage-policy.service";
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

test("cache hit does not consume daily quota", async () => {
  const now = Date.parse("2026-04-21T12:00:00.000Z");
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisUsagePolicyService(store, () => now);
  const context = makeContext();

  const result = await service.consumeIfNeeded({
    cacheDecision: { kind: "hit", payload: { ok: true } },
    context,
    dailyLimit: 1,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.dailyConsumed, false);
  assert.equal(result.dailyCount, 0);
});

test("cache miss consumes daily quota and enforces limit", async () => {
  const now = Date.parse("2026-04-21T12:00:00.000Z");
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisUsagePolicyService(store, () => now);
  const context = makeContext();

  const first = await service.consumeIfNeeded({
    cacheDecision: { kind: "miss" },
    context,
    dailyLimit: 1,
    cooldownMs: 0,
  });
  const second = await service.consumeIfNeeded({
    cacheDecision: { kind: "miss" },
    context,
    dailyLimit: 1,
    cooldownMs: 0,
  });

  assert.equal(first.allowed, true);
  assert.equal(first.dailyConsumed, true);
  assert.equal(first.dailyCount, 1);

  assert.equal(second.allowed, false);
  assert.equal(second.dailyConsumed, true);
  assert.equal(second.dailyCount, 2);
  assert.equal(second.reason, "daily_limit_exceeded");
});

test("blocked cache decision is denied and does not consume daily quota", async () => {
  const now = Date.parse("2026-04-21T12:00:00.000Z");
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisUsagePolicyService(store, () => now);
  const context = makeContext();

  const result = await service.consumeIfNeeded({
    cacheDecision: { kind: "blocked", reason: "in_progress" },
    context,
    dailyLimit: 1,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.dailyConsumed, false);
  assert.equal(result.dailyCount, 0);
  assert.equal(result.reason, null);
});

test("daily scope for anonymous requests falls back to stable ip", async () => {
  const now = Date.parse("2026-04-21T12:00:00.000Z");
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisUsagePolicyService(store, () => now);
  const firstRequest = makeContext({
    requestId: "req-1",
    userId: null,
    sessionInternalId: null,
    sessionPublicToken: null,
    ip: "198.51.100.10",
  });
  const secondRequest = makeContext({
    requestId: "req-2",
    userId: null,
    sessionInternalId: null,
    sessionPublicToken: null,
    ip: "198.51.100.10",
  });

  const first = await service.consumeIfNeeded({
    cacheDecision: { kind: "miss" },
    context: firstRequest,
    dailyLimit: 1,
    cooldownMs: 0,
  });
  const second = await service.consumeIfNeeded({
    cacheDecision: { kind: "miss" },
    context: secondRequest,
    dailyLimit: 1,
    cooldownMs: 0,
  });

  assert.equal(first.allowed, true);
  assert.equal(first.dailyCount, 1);
  assert.equal(second.allowed, false);
  assert.equal(second.dailyCount, 2);
  assert.equal(second.reason, "daily_limit_exceeded");
});

test("daily scope for anonymous requests does not use session alone", async () => {
  const now = Date.parse("2026-04-21T12:00:00.000Z");
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisUsagePolicyService(store, () => now);
  const firstRequest = makeContext({
    requestId: "req-1",
    userId: null,
    sessionInternalId: "session-shared",
    ip: "198.51.100.10",
  });
  const secondRequest = makeContext({
    requestId: "req-2",
    userId: null,
    sessionInternalId: "session-shared",
    ip: "198.51.100.11",
  });

  const first = await service.consumeIfNeeded({
    cacheDecision: { kind: "miss" },
    context: firstRequest,
    dailyLimit: 1,
    cooldownMs: 0,
  });
  const second = await service.consumeIfNeeded({
    cacheDecision: { kind: "miss" },
    context: secondRequest,
    dailyLimit: 1,
    cooldownMs: 0,
  });

  assert.equal(first.allowed, true);
  assert.equal(first.dailyCount, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.dailyCount, 1);
  assert.equal(second.reason, null);
});

test("cooldown blocks misses before daily limit consumption", async () => {
  const now = Date.parse("2026-04-21T12:00:00.000Z");
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisUsagePolicyService(store, () => now);
  const context = makeContext();

  const first = await service.consumeIfNeeded({
    cacheDecision: { kind: "miss" },
    context,
    cooldownMs: 30_000,
    dailyLimit: 10,
  });
  const second = await service.consumeIfNeeded({
    cacheDecision: { kind: "miss" },
    context,
    cooldownMs: 30_000,
    dailyLimit: 10,
  });

  assert.equal(first.allowed, true);
  assert.equal(first.dailyConsumed, true);
  assert.equal(first.dailyCount, 1);

  assert.equal(second.allowed, false);
  assert.equal(second.dailyConsumed, false);
  assert.equal(second.dailyCount, 1);
  assert.equal(second.reason, "cooldown_active");
});

test("cooldown expiration allows next miss", async () => {
  let now = Date.parse("2026-04-21T12:00:00.000Z");
  const store = new InMemoryOperationalStoreAdapter(() => now);
  const service = new AnalysisUsagePolicyService(store, () => now);
  const context = makeContext();

  await service.consumeIfNeeded({
    cacheDecision: { kind: "miss" },
    context,
    cooldownMs: 2_000,
    dailyLimit: 10,
  });

  now += 2_001;

  const afterCooldown = await service.consumeIfNeeded({
    cacheDecision: { kind: "miss" },
    context,
    cooldownMs: 2_000,
    dailyLimit: 10,
  });

  assert.equal(afterCooldown.allowed, true);
  assert.equal(afterCooldown.dailyConsumed, true);
  assert.equal(afterCooldown.dailyCount, 2);
  assert.equal(afterCooldown.reason, null);
});
