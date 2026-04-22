import { Inject, Injectable } from "@nestjs/common";
import {
  ANALYSIS_OPERATIONAL_STORE,
  type OperationalStorePort,
} from "./store/operational-store.port";
import type { AnalysisRequestContext } from "./types";

export type RawRateLimitOptions = {
  rawLimitPerMinute: number;
};

export type ContextualRateLimitOptions = {
  contextualLimitPerMinute: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  count: number;
  reason: "rate_limit_block_initial" | "rate_limit_block_contextual" | null;
};

@Injectable()
export class AnalysisRateLimitService {
  constructor(
    @Inject(ANALYSIS_OPERATIONAL_STORE)
    private readonly store: OperationalStorePort,
    private readonly now: () => number = Date.now,
  ) {}

  async checkRawLimit(
    context: AnalysisRequestContext,
    options: RawRateLimitOptions,
  ): Promise<RateLimitDecision> {
    const bucket = Math.floor(this.now() / 60_000);
    const rawScope = context.ip ? `ip:${context.ip}` : "unknown-ip";
    const key = `analysis:rl:raw:${rawScope}:${bucket}`;
    const count = await this.store.incrWindow(key, 60_000);

    if (count > options.rawLimitPerMinute) {
      return {
        allowed: false,
        count,
        reason: "rate_limit_block_initial",
      };
    }

    return {
      allowed: true,
      count,
      reason: null,
    };
  }

  async checkContextualLimit(
    context: AnalysisRequestContext,
    options: ContextualRateLimitOptions,
  ): Promise<RateLimitDecision> {
    const bucket = Math.floor(this.now() / 60_000);
    const scopes = this.resolveContextualScopes(context);
    let maxCount = 0;

    for (const scope of scopes) {
      const key = `analysis:rl:ctx:${scope}:${bucket}`;
      const count = await this.store.incrWindow(key, 60_000);
      maxCount = Math.max(maxCount, count);

      if (count > options.contextualLimitPerMinute) {
        return {
          allowed: false,
          count,
          reason: "rate_limit_block_contextual",
        };
      }
    }

    return {
      allowed: true,
      count: maxCount,
      reason: null,
    };
  }

  private resolveContextualScopes(context: AnalysisRequestContext) {
    const scopes: string[] = [];

    if (context.ip) {
      scopes.push(`ip:${context.ip}`);
    }

    if (context.sessionInternalId) {
      scopes.push(`session:${context.sessionInternalId}`);
    } else if (context.sessionPublicToken) {
      scopes.push(`session-public:${context.sessionPublicToken}`);
    }

    if (context.userId) {
      scopes.push(`user:${context.userId}`);
    }

    if (scopes.length === 0) {
      scopes.push(this.resolveIdentityScope(context));
    }

    return scopes;
  }

  private resolveIdentityScope(context: AnalysisRequestContext) {
    if (context.userId) {
      return `user:${context.userId}`;
    }

    if (context.sessionInternalId) {
      return `session:${context.sessionInternalId}`;
    }

    if (context.sessionPublicToken) {
      return `session-public:${context.sessionPublicToken}`;
    }

    if (context.ip) {
      return `ip:${context.ip}`;
    }

    return "unknown";
  }
}
