import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  ANALYSIS_OPERATIONAL_STORE,
  type OperationalStorePort,
} from "./store/operational-store.port";
import { ANALYSIS_NOW, type AnalysisRequestContext } from "./types";

export type UsageCacheDecision =
  | { kind: "hit"; payload: unknown }
  | { kind: "miss" }
  | { kind: "blocked"; reason: string };

export type ConsumeUsageInput = {
  cacheDecision: UsageCacheDecision;
  cooldownMs?: number;
  context: AnalysisRequestContext;
  dailyLimit: number;
};

export type UsagePolicyDecision = {
  allowed: boolean;
  dailyConsumed: boolean;
  dailyCount: number;
  reason: "cooldown_active" | "daily_limit_exceeded" | null;
};

@Injectable()
export class AnalysisUsagePolicyService {
  constructor(
    @Inject(ANALYSIS_OPERATIONAL_STORE)
    private readonly store: OperationalStorePort,
    @Optional()
    @Inject(ANALYSIS_NOW)
    private readonly now: () => number = Date.now,
  ) {}

  async consumeIfNeeded(
    input: ConsumeUsageInput,
  ): Promise<UsagePolicyDecision> {
    const key = this.dailyCounterKey(input.context);

    if (input.cacheDecision.kind === "blocked") {
      const current = (await this.store.get<number>(key)) ?? 0;

      return {
        allowed: false,
        dailyConsumed: false,
        dailyCount: current,
        reason: null,
      };
    }

    if (input.cacheDecision.kind === "hit") {
      const current = (await this.store.get<number>(key)) ?? 0;

      return {
        allowed: true,
        dailyConsumed: false,
        dailyCount: current,
        reason: null,
      };
    }

    const cooldownMs = Math.max(0, input.cooldownMs ?? 0);

    if (cooldownMs > 0) {
      const cooldownKey = this.cooldownKey(input.context);
      const lastUsageAt = await this.store.get<number>(cooldownKey);

      if (lastUsageAt !== null && this.now() - lastUsageAt < cooldownMs) {
        const current = (await this.store.get<number>(key)) ?? 0;

        return {
          allowed: false,
          dailyConsumed: false,
          dailyCount: current,
          reason: "cooldown_active",
        };
      }

      await this.store.set<number>(cooldownKey, this.now(), cooldownMs);
    }

    const count = await this.store.incrWindow(
      key,
      this.msUntilNextUtcDay(this.now()),
    );

    if (count > input.dailyLimit) {
      return {
        allowed: false,
        dailyConsumed: true,
        dailyCount: count,
        reason: "daily_limit_exceeded",
      };
    }

    return {
      allowed: true,
      dailyConsumed: true,
      dailyCount: count,
      reason: null,
    };
  }

  private dailyCounterKey(context: AnalysisRequestContext) {
    const day = new Date(this.now()).toISOString().slice(0, 10);

    return `analysis:usage:daily:${this.resolveScope(context)}:${day}`;
  }

  private cooldownKey(context: AnalysisRequestContext) {
    return `analysis:usage:cooldown:${this.resolveScope(context)}`;
  }

  private resolveScope(context: AnalysisRequestContext) {
    if (context.userId) {
      return `user:${context.userId}`;
    }

    if (context.sessionInternalId) {
      return `session:${context.sessionInternalId}:ip:${context.ip ?? "unknown"}`;
    }

    if (context.sessionPublicToken) {
      return `session-public:${context.sessionPublicToken}:ip:${context.ip ?? "unknown"}`;
    }

    if (context.ip) {
      return `ip:${context.ip}`;
    }

    return "unknown";
  }

  private msUntilNextUtcDay(nowMs: number) {
    const now = new Date(nowMs);
    const next = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    );

    return Math.max(1, next - nowMs);
  }
}
