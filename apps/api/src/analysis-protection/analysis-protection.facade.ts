import { HttpException, Inject, Injectable, Optional } from "@nestjs/common";
import { AnalysisConfigService } from "./analysis-config.service";
import { AnalysisDedupeCacheService } from "./analysis-dedupe-cache.service";
import { AnalysisRateLimitService } from "./analysis-rate-limit.service";
import { AnalysisTelemetryService } from "./analysis-telemetry.service";
import { AnalysisUsagePolicyService } from "./analysis-usage-policy.service";
import { ProtectedAiProviderGateway } from "./protected-ai-provider.gateway";
import { TurnstileVerificationService } from "./turnstile-verification.service";
import type { AnalysisRequestContext } from "./types";

export type ProtectedAnalysisInput<TPayload> = {
  payload: TPayload;
  skipTurnstile?: boolean;
  turnstileToken?: string | null;
};

export type ProtectedAnalysisBlockedResult = {
  message: string;
  ok: false;
  reason: string;
};

export type ProtectedAnalysisSuccessResult<TResult> = {
  cached: boolean;
  canonicalHash: string;
  ok: true;
  result: TResult;
};

export type ProtectedAnalysisResult<TResult> =
  | ProtectedAnalysisBlockedResult
  | ProtectedAnalysisSuccessResult<TResult>;

type AnalysisProtectionFacadeOptions = {
  cooldownMs?: number;
  dailyLimit?: number;
  providerMaxExecutionMs?: number;
  providerTimeoutMs?: number;
};

type RolloutMode = "observe-only" | "soft-block" | "hard-block";

const SOFT_BLOCK_HIGH_CONFIDENCE_REASONS = new Set([
  "anti_bot_blocked",
  "duplicate_request_blocked",
  "turnstile_expired",
  "turnstile_invalid",
  "turnstile_missing",
  "turnstile_unavailable",
  "turnstile_unconfigured",
]);

export const ANALYSIS_PROTECTION_FACADE_OPTIONS =
  "ANALYSIS_PROTECTION_FACADE_OPTIONS";

const DEFAULT_OPTIONS = {
  cooldownMs: 0,
  dailyLimit: 50,
  providerMaxExecutionMs: 60_000,
  providerTimeoutMs: 45_000,
} as const satisfies Required<AnalysisProtectionFacadeOptions>;

@Injectable()
export class AnalysisProtectionFacade {
  private readonly options: Required<AnalysisProtectionFacadeOptions>;

  constructor(
    @Inject(AnalysisConfigService)
    private readonly config: AnalysisConfigService,
    @Inject(AnalysisRateLimitService)
    private readonly rateLimit: AnalysisRateLimitService,
    @Inject(AnalysisDedupeCacheService)
    private readonly dedupe: AnalysisDedupeCacheService,
    @Inject(AnalysisUsagePolicyService)
    private readonly usagePolicy: AnalysisUsagePolicyService,
    @Inject(TurnstileVerificationService)
    private readonly turnstile: TurnstileVerificationService,
    @Inject(ProtectedAiProviderGateway)
    private readonly providerGateway: ProtectedAiProviderGateway,
    @Inject(AnalysisTelemetryService)
    private readonly telemetry: AnalysisTelemetryService,
    @Optional()
    @Inject(ANALYSIS_PROTECTION_FACADE_OPTIONS)
    options?: AnalysisProtectionFacadeOptions,
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...(options ?? {}),
    };
  }

  async executeProtectedAnalysis<TPayload, TResult>(
    input: ProtectedAnalysisInput<TPayload>,
    context: AnalysisRequestContext,
    runProvider: (payload: TPayload) => Promise<TResult>,
  ): Promise<ProtectedAnalysisResult<TResult>> {
    if (input.payload === null || input.payload === undefined) {
      await this.emitTelemetry("payload_invalid", context, {
        metadata: { reason: "payload_required" },
      });
      return this.block("payload_invalid", "Analysis payload is required");
    }

    if (!this.isPayloadStructurallyValid(input.payload)) {
      await this.emitTelemetry("payload_invalid", context, {
        metadata: { reason: "payload_structure_invalid" },
      });
      return this.block(
        "payload_invalid",
        "Analysis payload structure is invalid",
      );
    }

    await this.emitTelemetry("payload_valid", context);

    const canonicalHash = this.dedupe.buildCanonicalHash(input.payload);
    await this.emitTelemetry("canonical_hash_generated", context);

    const cfg = await this.config.getAll();
    const rolloutMode = this.resolveRolloutMode(cfg.rollout_mode);

    if (cfg.kill_switch_enabled || cfg.auth_emergency_enabled) {
      await this.emitTelemetry("kill_switch_blocked", context);
      return this.block(
        "kill_switch_blocked",
        "Analysis is temporarily unavailable",
      );
    }

    await this.emitTelemetry("kill_switch_passed", context);

    if (cfg.rate_limit_raw_enforced) {
      const rawDecision = await this.rateLimit.checkRawLimit(context, {
        rawLimitPerMinute: cfg.rate_limit_raw_per_minute,
      });

      if (!rawDecision.allowed) {
        await this.emitTelemetry("rate_limit_block_initial", context, {
          metadata: { count: rawDecision.count },
        });

        if (
          this.shouldBlockByRolloutMode(rolloutMode, "rate_limit_block_initial")
        ) {
          return this.block(
            "rate_limit_block_initial",
            "Rate limit reached for this IP",
          );
        }

        await this.emitRolloutAllowTelemetry(
          "rate_limit_block_initial",
          context,
          rolloutMode,
        );
      } else {
        await this.emitTelemetry("rate_limit_raw_passed", context, {
          metadata: { count: rawDecision.count },
        });
      }
    } else {
      await this.emitTelemetry("rate_limit_raw_passed", context, {
        metadata: { reason: "stage_skipped_flag_disabled" },
      });
    }

    const antiBotDecision = await this.dedupe.checkAntiBotHeuristic(
      context,
      canonicalHash,
      {
        repetitionThreshold: this.resolveAntiBotRepetitionThreshold(
          cfg.abuse_signal_threshold_percent,
        ),
      },
    );

    if (antiBotDecision.blocked) {
      await this.emitTelemetry("abuse_detected", context, {
        metadata: {
          count: antiBotDecision.count,
          decision: "anti_bot_blocked",
          thresholdPercent: cfg.abuse_signal_threshold_percent,
        },
      });

      if (this.shouldBlockByRolloutMode(rolloutMode, "anti_bot_blocked")) {
        return this.block(
          "anti_bot_blocked",
          "Repeated request pattern detected",
        );
      }

      await this.emitRolloutAllowTelemetry(
        "anti_bot_blocked",
        context,
        rolloutMode,
      );
    }

    if (cfg.turnstile_enforced && !input.skipTurnstile) {
      const turnstileDecision = await this.turnstile.verifyToken(
        input.turnstileToken,
        context,
        {
          expectedAction:
            (context as { routeKey?: string | null }).routeKey ?? undefined,
          maxTokenAgeMs: cfg.turnstile_max_token_age_ms,
        },
      );

      if (!turnstileDecision.valid) {
        const reason = turnstileDecision.reason ?? "turnstile_invalid";
        await this.emitTelemetry(reason, context);

        if (this.shouldBlockByRolloutMode(rolloutMode, reason)) {
          return this.block(reason, "Invalid anti-bot verification");
        }

        await this.emitRolloutAllowTelemetry(reason, context, rolloutMode);
      } else {
        await this.emitTelemetry("turnstile_valid", context);
      }
    } else if (input.skipTurnstile) {
      await this.emitTelemetry("turnstile_valid", context, {
        metadata: { reason: "stage_skipped_internal_route" },
      });
    } else {
      await this.emitTelemetry("turnstile_valid", context, {
        metadata: { reason: "stage_skipped_flag_disabled" },
      });
    }

    if (cfg.rate_limit_contextual_enforced) {
      const contextualDecision = await this.rateLimit.checkContextualLimit(
        context,
        {
          contextualLimitPerMinute: cfg.rate_limit_contextual_per_minute,
        },
      );

      if (!contextualDecision.allowed) {
        await this.emitTelemetry("rate_limit_block_contextual", context, {
          metadata: { count: contextualDecision.count },
        });

        if (
          this.shouldBlockByRolloutMode(
            rolloutMode,
            "rate_limit_block_contextual",
          )
        ) {
          return this.block(
            "rate_limit_block_contextual",
            "Contextual rate limit reached",
          );
        }

        await this.emitRolloutAllowTelemetry(
          "rate_limit_block_contextual",
          context,
          rolloutMode,
        );
      } else {
        await this.emitTelemetry("rate_limit_contextual_passed", context, {
          metadata: { count: contextualDecision.count },
        });
      }
    } else {
      await this.emitTelemetry("rate_limit_contextual_passed", context, {
        metadata: { reason: "stage_skipped_flag_disabled" },
      });
    }

    const cachedResult = await this.dedupe.getCachedResult<TResult>(
      context,
      canonicalHash,
    );

    if (cachedResult !== null) {
      await this.emitTelemetry("cache_hit", context);
      return {
        cached: true,
        canonicalHash,
        ok: true,
        result: cachedResult,
      };
    }

    await this.emitTelemetry("cache_miss", context);

    let lockAcquired = false;

    if (cfg.dedupe_enforced) {
      const lockDecision = await this.dedupe.tryAcquireLock(
        context,
        canonicalHash,
        cfg.dedupe_lock_ttl,
      );

      if (!lockDecision.acquired) {
        await this.emitTelemetry("duplicate_request_blocked", context);

        if (
          this.shouldBlockByRolloutMode(
            rolloutMode,
            "duplicate_request_blocked",
          )
        ) {
          return this.block(
            "duplicate_request_blocked",
            "Duplicate analysis request already in progress",
          );
        }

        await this.emitRolloutAllowTelemetry(
          "duplicate_request_blocked",
          context,
          rolloutMode,
        );
      } else {
        lockAcquired = true;
        await this.emitTelemetry("dedupe_lock_acquired", context);
      }
    } else {
      await this.emitTelemetry("dedupe_lock_acquired", context, {
        metadata: { reason: "stage_skipped_flag_disabled" },
      });
    }

    try {
      const usageDecision = await this.usagePolicy.consumeIfNeeded({
        cacheDecision: { kind: "miss" },
        context,
        cooldownMs: this.options.cooldownMs,
        dailyLimit: cfg.daily_limit_enforced
          ? this.options.dailyLimit
          : Number.MAX_SAFE_INTEGER,
      });

      if (!usageDecision.allowed) {
        const eventName =
          usageDecision.reason === "cooldown_active"
            ? "cooldown_block"
            : "daily_limit_block";

        await this.emitTelemetry(eventName, context, {
          metadata: { dailyCount: usageDecision.dailyCount },
        });

        if (this.shouldBlockByRolloutMode(rolloutMode, eventName)) {
          return this.block(eventName, "Usage policy blocked this request");
        }

        await this.emitRolloutAllowTelemetry(eventName, context, rolloutMode);
      } else {
        await this.emitTelemetry("usage_policy_passed", context, {
          metadata: {
            dailyCount: usageDecision.dailyCount,
            daily_limit_reason: cfg.daily_limit_enforced
              ? "stage_executed"
              : "stage_skipped_flag_disabled",
          },
        });
      }

      await this.emitTelemetry("openai_request_started", context);

      const result = await this.providerGateway.execute(
        () => runProvider(input.payload),
        {
          maxExecutionMs: this.options.providerMaxExecutionMs,
          timeoutMs: this.options.providerTimeoutMs,
        },
      );

      await this.emitTelemetry("openai_request_success", context);

      await this.dedupe.setCachedResult(context, canonicalHash, result);

      return {
        cached: false,
        canonicalHash,
        ok: true,
        result,
      };
    } catch (error) {
      await this.emitTelemetry("openai_request_failed", context, {
        metadata: {
          message: error instanceof Error ? error.message : "unknown_error",
        },
      });

      if (error instanceof HttpException) {
        throw error;
      }

      return this.block("openai_request_failed", "AI provider request failed");
    } finally {
      if (lockAcquired) {
        await this.dedupe.releaseLock(context, canonicalHash);
      }
    }
  }

  private block(
    reason: string,
    message: string,
  ): ProtectedAnalysisBlockedResult {
    return {
      message,
      ok: false,
      reason,
    };
  }

  private async emitTelemetry(
    eventName: Parameters<AnalysisTelemetryService["emit"]>[0],
    context: AnalysisRequestContext,
    input: Omit<
      Parameters<AnalysisTelemetryService["emit"]>[2],
      "routeKey"
    > = {},
  ) {
    const routeKey = (context as { routeKey?: string | null }).routeKey ?? null;
    await this.telemetry.emit(eventName, context, {
      ...input,
      routeKey,
    });
  }

  private isPayloadStructurallyValid<TPayload>(payload: TPayload) {
    return typeof payload === "object" && payload !== null;
  }

  private resolveRolloutMode(value: unknown): RolloutMode {
    if (
      value === "observe-only" ||
      value === "soft-block" ||
      value === "hard-block"
    ) {
      return value;
    }

    return "hard-block";
  }

  private shouldBlockByRolloutMode(mode: RolloutMode, reason: string) {
    if (mode === "hard-block") {
      return true;
    }

    if (mode === "observe-only") {
      return false;
    }

    return SOFT_BLOCK_HIGH_CONFIDENCE_REASONS.has(reason);
  }

  private async emitRolloutAllowTelemetry(
    stageReason: string,
    context: AnalysisRequestContext,
    rolloutMode: RolloutMode,
  ) {
    await this.emitTelemetry("abuse_detected", context, {
      metadata: {
        decision: "rollout_allow_continue",
        rolloutMode,
        stageReason,
      },
    });
  }

  private resolveAntiBotRepetitionThreshold(thresholdPercent: number) {
    const normalized = Math.min(100, Math.max(0, thresholdPercent));

    return Math.max(2, Math.ceil((normalized / 100) * 10));
  }
}
