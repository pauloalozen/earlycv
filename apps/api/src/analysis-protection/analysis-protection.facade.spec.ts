import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { SELF_DECLARED_DEPS_METADATA } from "@nestjs/common/constants";
import { AnalysisConfigService } from "./analysis-config.service";
import { AnalysisDedupeCacheService } from "./analysis-dedupe-cache.service";
import {
  ANALYSIS_PROTECTION_FACADE_OPTIONS,
  AnalysisProtectionFacade,
} from "./analysis-protection.facade";
import { AnalysisRateLimitService } from "./analysis-rate-limit.service";
import { AnalysisTelemetryService } from "./analysis-telemetry.service";
import { AnalysisUsagePolicyService } from "./analysis-usage-policy.service";
import { ProtectedAiProviderGateway } from "./protected-ai-provider.gateway";
import { InMemoryOperationalStoreAdapter } from "./store/in-memory-operational-store.adapter";
import { TurnstileVerificationService } from "./turnstile-verification.service";
import type { AnalysisRequestContext } from "./types";

type AnalysisRequestContextWithRoute = AnalysisRequestContext & {
  routeKey?: string | null;
};

type TelemetryCall = {
  context: AnalysisRequestContext;
  eventName: string;
  input: {
    metadata?: Record<string, unknown>;
    routeKey?: string | null;
  };
};

const makeContext = (
  overrides: Partial<AnalysisRequestContextWithRoute> = {},
): AnalysisRequestContextWithRoute => ({
  correlationId: "corr-1",
  ip: "203.0.113.10",
  requestId: "req-1",
  routeKey: "analysis/score-resume",
  sessionInternalId: "session-1",
  sessionPublicToken: null,
  userId: null,
  ...overrides,
});

const defaultConfig = {
  abuse_signal_threshold_percent: 85,
  auth_emergency_enabled: false,
  daily_limit_enforced: true,
  dedupe_enforced: true,
  dedupe_lock_ttl: 10_000,
  kill_switch_enabled: false,
  rate_limit_contextual_enforced: true,
  rate_limit_contextual_per_minute: 10,
  rate_limit_raw_enforced: true,
  rate_limit_raw_per_minute: 20,
  rollout_mode: "hard-block",
  turnstile_enforced: true,
  turnstile_max_token_age_ms: 120_000,
};

const createFacadeHarness = (
  configOverride: Partial<typeof defaultConfig> = {},
) => {
  const stageCalls: string[] = [];
  const telemetryCalls: TelemetryCall[] = [];

  const facade = new AnalysisProtectionFacade(
    {
      getAll: async () => ({
        ...defaultConfig,
        ...configOverride,
      }),
    } as any,
    {
      checkRawLimit: async () => {
        stageCalls.push("checkRawLimit");
        return { allowed: true, count: 1, reason: null };
      },
      checkContextualLimit: async () => {
        stageCalls.push("checkContextualLimit");
        return { allowed: true, count: 1, reason: null };
      },
    } as any,
    {
      buildCanonicalHash: () => {
        stageCalls.push("buildCanonicalHash");
        return "hash-1";
      },
      checkAntiBotHeuristic: async () => {
        stageCalls.push("checkAntiBotHeuristic");
        return { blocked: false, count: 1 };
      },
      getCachedResult: async () => {
        stageCalls.push("getCachedResult");
        return null;
      },
      releaseLock: async () => {
        stageCalls.push("releaseLock");
      },
      setCachedResult: async () => {
        stageCalls.push("setCachedResult");
      },
      tryAcquireLock: async () => {
        stageCalls.push("tryAcquireLock");
        return { acquired: true, key: "dedupe-key" };
      },
    } as any,
    {
      consumeIfNeeded: async () => {
        stageCalls.push("consumeIfNeeded");
        return {
          allowed: true,
          dailyConsumed: true,
          dailyCount: 1,
          reason: null,
        };
      },
    } as any,
    {
      verifyToken: async () => {
        stageCalls.push("verifyToken");
        return { valid: true, reason: null };
      },
    } as any,
    {
      execute: async (runProvider: () => Promise<unknown>) => {
        stageCalls.push("gatewayExecute");
        return runProvider();
      },
    } as any,
    {
      emit: async (
        eventName: string,
        context: AnalysisRequestContext,
        input: TelemetryCall["input"] = {},
      ) => {
        telemetryCalls.push({ context, eventName, input });
      },
    } as any,
    {
      cooldownMs: 0,
      dailyLimit: 100,
      providerMaxExecutionMs: 5_000,
      providerTimeoutMs: 5_000,
    },
  );

  return { facade, stageCalls, telemetryCalls };
};

const createRolloutHarness = (
  configOverride: Partial<typeof defaultConfig> = {},
  decisions: {
    antiBotBlocked?: boolean;
    contextualAllowed?: boolean;
    dedupeLockAcquired?: boolean;
    rawAllowed?: boolean;
    turnstileValid?: boolean;
    usageAllowed?: boolean;
  } = {},
) => {
  const telemetryCalls: TelemetryCall[] = [];
  let providerCallCount = 0;

  const facade = new AnalysisProtectionFacade(
    {
      getAll: async () => ({
        ...defaultConfig,
        ...configOverride,
      }),
    } as any,
    {
      checkRawLimit: async () => ({
        allowed: decisions.rawAllowed ?? true,
        count: 1,
        reason:
          (decisions.rawAllowed ?? true) ? null : "rate_limit_block_initial",
      }),
      checkContextualLimit: async () => ({
        allowed: decisions.contextualAllowed ?? true,
        count: 1,
        reason:
          (decisions.contextualAllowed ?? true)
            ? null
            : "rate_limit_block_contextual",
      }),
    } as any,
    {
      buildCanonicalHash: () => "hash-1",
      checkAntiBotHeuristic: async () => ({
        blocked: decisions.antiBotBlocked ?? false,
        count: 1,
      }),
      getCachedResult: async () => null,
      releaseLock: async () => {},
      setCachedResult: async () => {},
      tryAcquireLock: async () => ({
        acquired: decisions.dedupeLockAcquired ?? true,
        key: "dedupe-key",
      }),
    } as any,
    {
      consumeIfNeeded: async () => ({
        allowed: decisions.usageAllowed ?? true,
        dailyConsumed: true,
        dailyCount: 1,
        reason:
          (decisions.usageAllowed ?? true) ? null : "daily_limit_exceeded",
      }),
    } as any,
    {
      verifyToken: async () => ({
        valid: decisions.turnstileValid ?? true,
        reason: (decisions.turnstileValid ?? true) ? null : "turnstile_invalid",
      }),
    } as any,
    {
      execute: async (runProvider: () => Promise<unknown>) => runProvider(),
    } as any,
    {
      emit: async (
        eventName: string,
        context: AnalysisRequestContext,
        input: TelemetryCall["input"] = {},
      ) => {
        telemetryCalls.push({ context, eventName, input });
      },
    } as any,
    {
      cooldownMs: 0,
      dailyLimit: 1,
      providerMaxExecutionMs: 5_000,
      providerTimeoutMs: 5_000,
    },
  );

  const run = async () =>
    facade.executeProtectedAnalysis(
      {
        payload: { cv: "resume", job: "description" },
        turnstileToken: "token",
      },
      makeContext(),
      async () => {
        providerCallCount += 1;
        return { adapted: true };
      },
    );

  return {
    run,
    telemetryCalls,
    getProviderCallCount: () => providerCallCount,
  };
};

test("constructor metadata resolves class tokens for DI", () => {
  const declaredDeps = Reflect.getMetadata(
    SELF_DECLARED_DEPS_METADATA,
    AnalysisProtectionFacade,
  ) as Array<{ index: number; param: unknown }>;

  const orderedDeps = [...declaredDeps].sort((a, b) => a.index - b.index);

  assert.deepEqual(orderedDeps, [
    { index: 0, param: AnalysisConfigService },
    { index: 1, param: AnalysisRateLimitService },
    { index: 2, param: AnalysisDedupeCacheService },
    { index: 3, param: AnalysisUsagePolicyService },
    { index: 4, param: TurnstileVerificationService },
    { index: 5, param: ProtectedAiProviderGateway },
    { index: 6, param: AnalysisTelemetryService },
    { index: 7, param: ANALYSIS_PROTECTION_FACADE_OPTIONS },
  ]);
});

test("pipeline executes in mandatory stage order before provider", async () => {
  const { facade, stageCalls, telemetryCalls } = createFacadeHarness();
  const context = makeContext();

  const result = await facade.executeProtectedAnalysis(
    {
      payload: { cv: "resume", job: "description" },
      turnstileToken: "valid-token",
    },
    context,
    async () => {
      stageCalls.push("providerCall");
      return { adapted: true };
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(stageCalls, [
    "buildCanonicalHash",
    "checkRawLimit",
    "checkAntiBotHeuristic",
    "verifyToken",
    "checkContextualLimit",
    "getCachedResult",
    "tryAcquireLock",
    "consumeIfNeeded",
    "gatewayExecute",
    "providerCall",
    "setCachedResult",
    "releaseLock",
  ]);
  assert.deepEqual(
    telemetryCalls.map((entry) => entry.eventName),
    [
      "payload_valid",
      "canonical_hash_generated",
      "kill_switch_passed",
      "rate_limit_raw_passed",
      "turnstile_valid",
      "rate_limit_contextual_passed",
      "cache_miss",
      "dedupe_lock_acquired",
      "usage_policy_passed",
      "openai_request_started",
      "openai_request_success",
    ],
  );
  assert.equal(telemetryCalls.length > 0, true);
  assert.equal(
    telemetryCalls.every((entry) => entry.input.routeKey === context.routeKey),
    true,
  );
});

test("blocks invalid payload structure before hash generation", async () => {
  const { facade, stageCalls, telemetryCalls } = createFacadeHarness();

  const result = await facade.executeProtectedAnalysis(
    {
      payload: "cv and job" as unknown as Record<string, string>,
      turnstileToken: "valid-token",
    },
    makeContext(),
    async () => ({ adapted: true }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "payload_invalid");
  assert.deepEqual(stageCalls, []);
  assert.equal(telemetryCalls.length, 1);
  assert.equal(telemetryCalls[0]?.eventName, "payload_invalid");
  assert.equal(
    telemetryCalls[0]?.input.metadata?.reason,
    "payload_structure_invalid",
  );
});

test("pipeline stops on invalid turnstile and never calls provider", async () => {
  const stageCalls: string[] = [];
  let providerCallCount = 0;

  const facade = new AnalysisProtectionFacade(
    { getAll: async () => defaultConfig } as any,
    {
      checkRawLimit: async () => {
        stageCalls.push("checkRawLimit");
        return { allowed: true, count: 1, reason: null };
      },
      checkContextualLimit: async () => {
        stageCalls.push("checkContextualLimit");
        return { allowed: true, count: 1, reason: null };
      },
    } as any,
    {
      buildCanonicalHash: () => "hash-1",
      checkAntiBotHeuristic: async () => {
        stageCalls.push("checkAntiBotHeuristic");
        return { blocked: false, count: 1 };
      },
      getCachedResult: async () => null,
      releaseLock: async () => {},
      tryAcquireLock: async () => ({ acquired: true, key: "dedupe-key" }),
    } as any,
    {
      consumeIfNeeded: async () => ({
        allowed: true,
        dailyConsumed: false,
        dailyCount: 0,
        reason: null,
      }),
    } as any,
    {
      verifyToken: async () => {
        stageCalls.push("verifyToken");
        return { valid: false, reason: "turnstile_invalid" };
      },
    } as any,
    {
      execute: async (runProvider: () => Promise<unknown>) => runProvider(),
    } as any,
    {
      emit: async () => {},
    } as any,
    {
      cooldownMs: 0,
      dailyLimit: 100,
      providerMaxExecutionMs: 5_000,
      providerTimeoutMs: 5_000,
    },
  );

  const result = await facade.executeProtectedAnalysis(
    {
      payload: { cv: "resume", job: "description" },
      turnstileToken: "invalid",
    },
    makeContext(),
    async () => {
      providerCallCount += 1;
      return { adapted: true };
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "turnstile_invalid");
  assert.equal(providerCallCount, 0);
  assert.deepEqual(stageCalls, [
    "checkRawLimit",
    "checkAntiBotHeuristic",
    "verifyToken",
  ]);
});

test("pipeline fail-fast blocks provider when raw rate limit is denied", async () => {
  let providerCallCount = 0;

  const facade = new AnalysisProtectionFacade(
    { getAll: async () => defaultConfig } as any,
    {
      checkRawLimit: async () => ({
        allowed: false,
        count: 21,
        reason: "rate_limit_block_initial",
      }),
      checkContextualLimit: async () => ({
        allowed: true,
        count: 1,
        reason: null,
      }),
    } as any,
    {
      buildCanonicalHash: () => "hash-1",
      checkAntiBotHeuristic: async () => ({ blocked: false, count: 1 }),
      getCachedResult: async () => null,
      releaseLock: async () => {},
      tryAcquireLock: async () => ({ acquired: true, key: "dedupe-key" }),
    } as any,
    {
      consumeIfNeeded: async () => ({
        allowed: true,
        dailyConsumed: false,
        dailyCount: 0,
        reason: null,
      }),
    } as any,
    {
      verifyToken: async () => ({ valid: true, reason: null }),
    } as any,
    {
      execute: async (runProvider: () => Promise<unknown>) => runProvider(),
    } as any,
    {
      emit: async () => {},
    } as any,
    {
      cooldownMs: 0,
      dailyLimit: 100,
      providerMaxExecutionMs: 5_000,
      providerTimeoutMs: 5_000,
    },
  );

  const result = await facade.executeProtectedAnalysis(
    {
      payload: { cv: "resume", job: "description" },
      turnstileToken: "valid-token",
    },
    makeContext(),
    async () => {
      providerCallCount += 1;
      return { adapted: true };
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "rate_limit_block_initial");
  assert.equal(providerCallCount, 0);
});

test("pipeline fail-fast blocks when kill switch or auth emergency is enabled", async () => {
  for (const flags of [
    { kill_switch_enabled: true },
    { auth_emergency_enabled: true },
  ]) {
    let providerCallCount = 0;

    const facade = new AnalysisProtectionFacade(
      {
        getAll: async () => ({
          ...defaultConfig,
          ...flags,
        }),
      } as any,
      {
        checkRawLimit: async () => ({ allowed: true, count: 1, reason: null }),
        checkContextualLimit: async () => ({
          allowed: true,
          count: 1,
          reason: null,
        }),
      } as any,
      {
        buildCanonicalHash: () => "hash-1",
        checkAntiBotHeuristic: async () => ({ blocked: false, count: 1 }),
        getCachedResult: async () => null,
        releaseLock: async () => {},
        tryAcquireLock: async () => ({ acquired: true, key: "dedupe-key" }),
      } as any,
      {
        consumeIfNeeded: async () => ({
          allowed: true,
          dailyConsumed: false,
          dailyCount: 0,
          reason: null,
        }),
      } as any,
      {
        verifyToken: async () => ({ valid: true, reason: null }),
      } as any,
      {
        execute: async (runProvider: () => Promise<unknown>) => runProvider(),
      } as any,
      {
        emit: async () => {},
      } as any,
      {
        cooldownMs: 0,
        dailyLimit: 100,
        providerMaxExecutionMs: 5_000,
        providerTimeoutMs: 5_000,
      },
    );

    const result = await facade.executeProtectedAnalysis(
      {
        payload: { cv: "resume", job: "description" },
        turnstileToken: "valid-token",
      },
      makeContext(),
      async () => {
        providerCallCount += 1;
        return { adapted: true };
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "kill_switch_blocked");
    assert.equal(providerCallCount, 0);
  }
});

test("pipeline fail-fast blocks provider when contextual rate limit is denied", async () => {
  let providerCallCount = 0;

  const facade = new AnalysisProtectionFacade(
    { getAll: async () => defaultConfig } as any,
    {
      checkRawLimit: async () => ({ allowed: true, count: 1, reason: null }),
      checkContextualLimit: async () => ({
        allowed: false,
        count: 11,
        reason: "rate_limit_block_contextual",
      }),
    } as any,
    {
      buildCanonicalHash: () => "hash-1",
      checkAntiBotHeuristic: async () => ({ blocked: false, count: 1 }),
      getCachedResult: async () => null,
      releaseLock: async () => {},
      tryAcquireLock: async () => ({ acquired: true, key: "dedupe-key" }),
    } as any,
    {
      consumeIfNeeded: async () => ({
        allowed: true,
        dailyConsumed: false,
        dailyCount: 0,
        reason: null,
      }),
    } as any,
    {
      verifyToken: async () => ({ valid: true, reason: null }),
    } as any,
    {
      execute: async (runProvider: () => Promise<unknown>) => runProvider(),
    } as any,
    {
      emit: async () => {},
    } as any,
    {
      cooldownMs: 0,
      dailyLimit: 100,
      providerMaxExecutionMs: 5_000,
      providerTimeoutMs: 5_000,
    },
  );

  const result = await facade.executeProtectedAnalysis(
    {
      payload: { cv: "resume", job: "description" },
      turnstileToken: "valid-token",
    },
    makeContext(),
    async () => {
      providerCallCount += 1;
      return { adapted: true };
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "rate_limit_block_contextual");
  assert.equal(providerCallCount, 0);
});

test("pipeline fail-fast blocks provider when dedupe lock cannot be acquired", async () => {
  let providerCallCount = 0;

  const facade = new AnalysisProtectionFacade(
    { getAll: async () => defaultConfig } as any,
    {
      checkRawLimit: async () => ({ allowed: true, count: 1, reason: null }),
      checkContextualLimit: async () => ({
        allowed: true,
        count: 1,
        reason: null,
      }),
    } as any,
    {
      buildCanonicalHash: () => "hash-1",
      checkAntiBotHeuristic: async () => ({ blocked: false, count: 1 }),
      getCachedResult: async () => null,
      releaseLock: async () => {},
      tryAcquireLock: async () => ({ acquired: false, key: "dedupe-key" }),
    } as any,
    {
      consumeIfNeeded: async () => ({
        allowed: true,
        dailyConsumed: false,
        dailyCount: 0,
        reason: null,
      }),
    } as any,
    {
      verifyToken: async () => ({ valid: true, reason: null }),
    } as any,
    {
      execute: async (runProvider: () => Promise<unknown>) => runProvider(),
    } as any,
    {
      emit: async () => {},
    } as any,
    {
      cooldownMs: 0,
      dailyLimit: 100,
      providerMaxExecutionMs: 5_000,
      providerTimeoutMs: 5_000,
    },
  );

  const result = await facade.executeProtectedAnalysis(
    {
      payload: { cv: "resume", job: "description" },
      turnstileToken: "valid-token",
    },
    makeContext(),
    async () => {
      providerCallCount += 1;
      return { adapted: true };
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "duplicate_request_blocked");
  assert.equal(providerCallCount, 0);
});

test("pipeline fail-fast blocks provider for cooldown and daily limit", async () => {
  const usageDecisions = [
    { reason: "cooldown_active", expected: "cooldown_block" },
    { reason: "daily_limit_exceeded", expected: "daily_limit_block" },
  ] as const;

  for (const decision of usageDecisions) {
    let providerCallCount = 0;

    const facade = new AnalysisProtectionFacade(
      { getAll: async () => defaultConfig } as any,
      {
        checkRawLimit: async () => ({ allowed: true, count: 1, reason: null }),
        checkContextualLimit: async () => ({
          allowed: true,
          count: 1,
          reason: null,
        }),
      } as any,
      {
        buildCanonicalHash: () => "hash-1",
        checkAntiBotHeuristic: async () => ({ blocked: false, count: 1 }),
        getCachedResult: async () => null,
        releaseLock: async () => {},
        tryAcquireLock: async () => ({ acquired: true, key: "dedupe-key" }),
      } as any,
      {
        consumeIfNeeded: async () => ({
          allowed: false,
          dailyConsumed: false,
          dailyCount: 3,
          reason: decision.reason,
        }),
      } as any,
      {
        verifyToken: async () => ({ valid: true, reason: null }),
      } as any,
      {
        execute: async (runProvider: () => Promise<unknown>) => runProvider(),
      } as any,
      {
        emit: async () => {},
      } as any,
      {
        cooldownMs: 0,
        dailyLimit: 2,
        providerMaxExecutionMs: 5_000,
        providerTimeoutMs: 5_000,
      },
    );

    const result = await facade.executeProtectedAnalysis(
      {
        payload: { cv: "resume", job: "description" },
        turnstileToken: "valid-token",
      },
      makeContext(),
      async () => {
        providerCallCount += 1;
        return { adapted: true };
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, decision.expected);
    assert.equal(providerCallCount, 0);
  }
});

test("provider failures are translated into controlled block result", async () => {
  const stageCalls: string[] = [];

  const facade = new AnalysisProtectionFacade(
    { getAll: async () => defaultConfig } as any,
    {
      checkRawLimit: async () => ({ allowed: true, count: 1, reason: null }),
      checkContextualLimit: async () => ({
        allowed: true,
        count: 1,
        reason: null,
      }),
    } as any,
    {
      buildCanonicalHash: () => "hash-1",
      checkAntiBotHeuristic: async () => ({ blocked: false, count: 1 }),
      getCachedResult: async () => null,
      releaseLock: async () => {
        stageCalls.push("releaseLock");
      },
      tryAcquireLock: async () => ({ acquired: true, key: "dedupe-key" }),
    } as any,
    {
      consumeIfNeeded: async () => ({
        allowed: true,
        dailyConsumed: false,
        dailyCount: 0,
        reason: null,
      }),
    } as any,
    {
      verifyToken: async () => ({ valid: true, reason: null }),
    } as any,
    {
      execute: async () => {
        throw new Error("provider timeout");
      },
    } as any,
    {
      emit: async () => {},
    } as any,
    {
      cooldownMs: 0,
      dailyLimit: 100,
      providerMaxExecutionMs: 5_000,
      providerTimeoutMs: 5_000,
    },
  );

  const result = await facade.executeProtectedAnalysis(
    {
      payload: { cv: "resume", job: "description" },
      turnstileToken: "valid-token",
    },
    makeContext(),
    async () => ({ adapted: true }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "openai_request_failed");
  assert.equal(stageCalls.includes("releaseLock"), true);
});

test("skipped enforced stages still emit decision telemetry with skip reason", async () => {
  const { facade, telemetryCalls } = createFacadeHarness({
    daily_limit_enforced: false,
    dedupe_enforced: false,
    rate_limit_contextual_enforced: false,
    rate_limit_raw_enforced: false,
    turnstile_enforced: false,
  });

  const result = await facade.executeProtectedAnalysis(
    {
      payload: { cv: "resume", job: "description" },
      turnstileToken: null,
    },
    makeContext(),
    async () => ({ adapted: true }),
  );

  assert.equal(result.ok, true);

  const decisionEvents = telemetryCalls.filter((entry) =>
    [
      "rate_limit_raw_passed",
      "turnstile_valid",
      "rate_limit_contextual_passed",
      "dedupe_lock_acquired",
      "usage_policy_passed",
    ].includes(entry.eventName),
  );

  assert.equal(decisionEvents.length, 5);
  assert.equal(
    decisionEvents.every(
      (entry) =>
        entry.input.metadata?.reason === "stage_skipped_flag_disabled" ||
        entry.eventName === "usage_policy_passed",
    ),
    true,
  );
  const usageEvent = decisionEvents.find(
    (entry) => entry.eventName === "usage_policy_passed",
  );
  assert.equal(
    usageEvent?.input.metadata?.daily_limit_reason,
    "stage_skipped_flag_disabled",
  );
});

test("concurrent same hash requests allow only one provider execution", async () => {
  const store = new InMemoryOperationalStoreAdapter();
  const dedupe = new AnalysisDedupeCacheService(store);
  const telemetryEvents: string[] = [];
  let providerCallCount = 0;

  const facade = new AnalysisProtectionFacade(
    {
      getAll: async () => ({
        ...defaultConfig,
        dedupe_lock_ttl: 20_000,
      }),
    } as any,
    {
      checkRawLimit: async () => ({ allowed: true, count: 1, reason: null }),
      checkContextualLimit: async () => ({
        allowed: true,
        count: 1,
        reason: null,
      }),
    } as any,
    dedupe,
    {
      consumeIfNeeded: async () => ({
        allowed: true,
        dailyConsumed: true,
        dailyCount: 1,
        reason: null,
      }),
    } as any,
    {
      verifyToken: async () => ({ valid: true, reason: null }),
    } as any,
    {
      execute: async (runProvider: () => Promise<unknown>) => runProvider(),
    } as any,
    {
      emit: async (eventName: string) => {
        telemetryEvents.push(eventName);
      },
    } as any,
    {
      cooldownMs: 0,
      dailyLimit: 100,
      providerMaxExecutionMs: 5_000,
      providerTimeoutMs: 5_000,
    },
  );

  const provider = async () => {
    providerCallCount += 1;
    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
    return { adapted: true };
  };

  const [first, second] = await Promise.all([
    facade.executeProtectedAnalysis(
      {
        payload: { cv: "resume", job: "description" },
        turnstileToken: "valid-token",
      },
      makeContext({ requestId: "req-concurrency-1" }),
      provider,
    ),
    facade.executeProtectedAnalysis(
      {
        payload: { cv: "resume", job: "description" },
        turnstileToken: "valid-token",
      },
      makeContext({ requestId: "req-concurrency-2" }),
      provider,
    ),
  ]);

  assert.equal(providerCallCount, 1);
  assert.equal(first.ok || second.ok, true);
  const blocked = [first, second].find((entry) => !entry.ok);
  assert.ok(blocked);
  assert.equal(blocked.reason, "duplicate_request_blocked");
  assert.equal(telemetryEvents.includes("duplicate_request_blocked"), true);
});

test("observe-only emits block telemetry but allows request", async () => {
  const harness = createRolloutHarness(
    { rollout_mode: "observe-only" },
    { turnstileValid: false },
  );

  const result = await harness.run();

  assert.equal(result.ok, true);
  assert.equal(harness.getProviderCallCount(), 1);
  assert.equal(
    harness.telemetryCalls.some(
      (entry) => entry.eventName === "turnstile_invalid",
    ),
    true,
  );
  assert.equal(
    harness.telemetryCalls.some(
      (entry) => entry.eventName === "abuse_detected",
    ),
    true,
  );
  assert.equal(
    harness.telemetryCalls.some(
      (entry) => entry.eventName === "turnstile_valid",
    ),
    false,
  );
});

test("observe-only failed dedupe lock does not emit acquired event or release lock", async () => {
  const telemetryEvents: string[] = [];
  let releaseLockCallCount = 0;
  let providerCallCount = 0;

  const facade = new AnalysisProtectionFacade(
    {
      getAll: async () => ({
        ...defaultConfig,
        rollout_mode: "observe-only",
      }),
    } as any,
    {
      checkRawLimit: async () => ({ allowed: true, count: 1, reason: null }),
      checkContextualLimit: async () => ({
        allowed: true,
        count: 1,
        reason: null,
      }),
    } as any,
    {
      buildCanonicalHash: () => "hash-1",
      checkAntiBotHeuristic: async () => ({ blocked: false, count: 1 }),
      getCachedResult: async () => null,
      releaseLock: async () => {
        releaseLockCallCount += 1;
      },
      setCachedResult: async () => {},
      tryAcquireLock: async () => ({ acquired: false, key: "dedupe-key" }),
    } as any,
    {
      consumeIfNeeded: async () => ({
        allowed: true,
        dailyConsumed: true,
        dailyCount: 1,
        reason: null,
      }),
    } as any,
    {
      verifyToken: async () => ({ valid: true, reason: null }),
    } as any,
    {
      execute: async (runProvider: () => Promise<unknown>) => runProvider(),
    } as any,
    {
      emit: async (eventName: string) => {
        telemetryEvents.push(eventName);
      },
    } as any,
    {
      cooldownMs: 0,
      dailyLimit: 100,
      providerMaxExecutionMs: 5_000,
      providerTimeoutMs: 5_000,
    },
  );

  const result = await facade.executeProtectedAnalysis(
    {
      payload: { cv: "resume", job: "description" },
      turnstileToken: "valid-token",
    },
    makeContext(),
    async () => {
      providerCallCount += 1;
      return { adapted: true };
    },
  );

  assert.equal(result.ok, true);
  assert.equal(providerCallCount, 1);
  assert.equal(telemetryEvents.includes("duplicate_request_blocked"), true);
  assert.equal(telemetryEvents.includes("abuse_detected"), true);
  assert.equal(telemetryEvents.includes("dedupe_lock_acquired"), false);
  assert.equal(releaseLockCallCount, 0);
});

test("observe-only failed rate limits do not emit pass events", async () => {
  const rawLimited = createRolloutHarness(
    { rollout_mode: "observe-only" },
    { rawAllowed: false },
  );
  const rawResult = await rawLimited.run();

  assert.equal(rawResult.ok, true);
  assert.equal(rawLimited.getProviderCallCount(), 1);
  assert.equal(
    rawLimited.telemetryCalls.some(
      (entry) => entry.eventName === "rate_limit_block_initial",
    ),
    true,
  );
  assert.equal(
    rawLimited.telemetryCalls.some(
      (entry) => entry.eventName === "abuse_detected",
    ),
    true,
  );
  assert.equal(
    rawLimited.telemetryCalls.some(
      (entry) => entry.eventName === "rate_limit_raw_passed",
    ),
    false,
  );

  const contextualLimited = createRolloutHarness(
    { rollout_mode: "observe-only" },
    { contextualAllowed: false },
  );
  const contextualResult = await contextualLimited.run();

  assert.equal(contextualResult.ok, true);
  assert.equal(contextualLimited.getProviderCallCount(), 1);
  assert.equal(
    contextualLimited.telemetryCalls.some(
      (entry) => entry.eventName === "rate_limit_block_contextual",
    ),
    true,
  );
  assert.equal(
    contextualLimited.telemetryCalls.some(
      (entry) => entry.eventName === "abuse_detected",
    ),
    true,
  );
  assert.equal(
    contextualLimited.telemetryCalls.some(
      (entry) => entry.eventName === "rate_limit_contextual_passed",
    ),
    false,
  );
});

test("soft-block blocks only high-confidence risk conditions", async () => {
  const lowConfidence = createRolloutHarness(
    { rollout_mode: "soft-block" },
    { contextualAllowed: false },
  );
  const lowConfidenceResult = await lowConfidence.run();

  assert.equal(lowConfidenceResult.ok, true);
  assert.equal(lowConfidence.getProviderCallCount(), 1);
  assert.equal(
    lowConfidence.telemetryCalls.some(
      (entry) => entry.eventName === "rate_limit_block_contextual",
    ),
    true,
  );

  const highConfidence = createRolloutHarness(
    { rollout_mode: "soft-block" },
    { turnstileValid: false },
  );
  const highConfidenceResult = await highConfidence.run();

  assert.equal(highConfidenceResult.ok, false);
  assert.equal(highConfidenceResult.reason, "turnstile_invalid");
  assert.equal(highConfidence.getProviderCallCount(), 0);

  const antiBot = createRolloutHarness(
    { rollout_mode: "soft-block" },
    { antiBotBlocked: true },
  );
  const antiBotResult = await antiBot.run();

  assert.equal(antiBotResult.ok, false);
  assert.equal(antiBotResult.reason, "anti_bot_blocked");
  assert.equal(antiBot.getProviderCallCount(), 0);
});

test("skipTurnstile allows internal route execution without deadlock", async () => {
  const stageCalls: string[] = [];
  const telemetryCalls: TelemetryCall[] = [];

  const facade = new AnalysisProtectionFacade(
    { getAll: async () => defaultConfig } as any,
    {
      checkRawLimit: async () => {
        stageCalls.push("checkRawLimit");
        return { allowed: true, count: 1, reason: null };
      },
      checkContextualLimit: async () => {
        stageCalls.push("checkContextualLimit");
        return { allowed: true, count: 1, reason: null };
      },
    } as any,
    {
      buildCanonicalHash: () => "hash-1",
      checkAntiBotHeuristic: async () => {
        stageCalls.push("checkAntiBotHeuristic");
        return { blocked: false, count: 1 };
      },
      getCachedResult: async () => null,
      releaseLock: async () => {},
      setCachedResult: async () => {},
      tryAcquireLock: async () => ({ acquired: true, key: "dedupe-key" }),
    } as any,
    {
      consumeIfNeeded: async () => ({
        allowed: true,
        dailyConsumed: false,
        dailyCount: 0,
        reason: null,
      }),
    } as any,
    {
      verifyToken: async () => {
        stageCalls.push("verifyToken");
        return { valid: true, reason: null };
      },
    } as any,
    {
      execute: async (runProvider: () => Promise<unknown>) => runProvider(),
    } as any,
    {
      emit: async (
        eventName: string,
        context: AnalysisRequestContext,
        input: TelemetryCall["input"] = {},
      ) => {
        telemetryCalls.push({ context, eventName, input });
      },
    } as any,
    {
      cooldownMs: 0,
      dailyLimit: 100,
      providerMaxExecutionMs: 5_000,
      providerTimeoutMs: 5_000,
    },
  );

  const result = await facade.executeProtectedAnalysis(
    {
      payload: { cv: "resume", job: "description" },
      skipTurnstile: true,
      turnstileToken: null,
    } as any,
    makeContext({ routeKey: "cv-adaptation/internal-paid-output" }),
    async () => ({ adapted: true }),
  );

  assert.equal(result.ok, true);
  assert.equal(stageCalls.includes("verifyToken"), false);
  assert.equal(
    telemetryCalls.some(
      (entry) =>
        entry.eventName === "turnstile_valid" &&
        entry.input.metadata?.reason === "stage_skipped_internal_route",
    ),
    true,
  );
});

test("hard-block enforces deterministic blocking", async () => {
  const harness = createRolloutHarness(
    { rollout_mode: "hard-block" },
    { contextualAllowed: false },
  );
  const result = await harness.run();

  assert.equal(result.ok, false);
  assert.equal(result.reason, "rate_limit_block_contextual");
  assert.equal(harness.getProviderCallCount(), 0);
});

test("smoke matrix covers key flag combinations and rollout transitions", async () => {
  type SmokeScenario = {
    config: Partial<typeof defaultConfig>;
    decisions: {
      contextualAllowed?: boolean;
      dedupeLockAcquired?: boolean;
      rawAllowed?: boolean;
      turnstileValid?: boolean;
      usageAllowed?: boolean;
    };
    expectedEvent?: string;
    expectedOk: boolean;
    expectedProviderCalls: number;
    expectedReason?: string;
  };

  const scenarios: SmokeScenario[] = [
    {
      config: {
        rollout_mode: "observe-only",
        turnstile_enforced: true,
      },
      decisions: { turnstileValid: false },
      expectedOk: true,
      expectedProviderCalls: 1,
      expectedEvent: "turnstile_invalid",
    },
    {
      config: {
        rollout_mode: "soft-block",
        rate_limit_contextual_enforced: true,
      },
      decisions: { contextualAllowed: false },
      expectedOk: true,
      expectedProviderCalls: 1,
      expectedEvent: "rate_limit_block_contextual",
    },
    {
      config: {
        rollout_mode: "hard-block",
        dedupe_enforced: true,
      },
      decisions: { dedupeLockAcquired: false },
      expectedOk: false,
      expectedProviderCalls: 0,
      expectedReason: "duplicate_request_blocked",
    },
    {
      config: {
        rollout_mode: "hard-block",
        daily_limit_enforced: true,
      },
      decisions: { usageAllowed: false },
      expectedOk: false,
      expectedProviderCalls: 0,
      expectedReason: "daily_limit_block",
    },
    {
      config: {
        rollout_mode: "hard-block",
        rate_limit_raw_enforced: false,
        rate_limit_contextual_enforced: true,
      },
      decisions: { contextualAllowed: false },
      expectedOk: false,
      expectedProviderCalls: 0,
      expectedReason: "rate_limit_block_contextual",
    },
    {
      config: {
        auth_emergency_enabled: true,
        rollout_mode: "observe-only",
      },
      decisions: {},
      expectedOk: false,
      expectedProviderCalls: 0,
      expectedReason: "kill_switch_blocked",
    },
    {
      config: {
        kill_switch_enabled: true,
        rollout_mode: "hard-block",
      },
      decisions: {},
      expectedOk: false,
      expectedProviderCalls: 0,
      expectedReason: "kill_switch_blocked",
    },
  ];

  for (const scenario of scenarios) {
    const harness = createRolloutHarness(scenario.config, scenario.decisions);
    const result = await harness.run();

    assert.equal(result.ok, scenario.expectedOk);
    assert.equal(
      harness.getProviderCallCount(),
      scenario.expectedProviderCalls,
    );

    if (scenario.expectedEvent) {
      assert.equal(
        harness.telemetryCalls.some(
          (entry) => entry.eventName === scenario.expectedEvent,
        ),
        true,
      );
    }

    if (scenario.expectedReason && !result.ok) {
      assert.equal(result.reason, scenario.expectedReason);
    }
  }
});
