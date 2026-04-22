import { createHash } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  ANALYSIS_OPERATIONAL_STORE,
  type OperationalStorePort,
} from "./store/operational-store.port";
import { ANALYSIS_NOW, type AnalysisRequestContext } from "./types";

export type DedupeLockDecision = {
  acquired: boolean;
  key: string;
};

type AntiBotState = {
  count: number;
  lastSeenAt: number;
};

export type AntiBotHeuristicOptions = {
  shortIntervalMs?: number;
  repetitionThreshold?: number;
  stateTtlMs?: number;
};

export type AntiBotHeuristicDecision = {
  blocked: boolean;
  count: number;
};

@Injectable()
export class AnalysisDedupeCacheService {
  constructor(
    @Inject(ANALYSIS_OPERATIONAL_STORE)
    private readonly store: OperationalStorePort,
    @Optional()
    @Inject(ANALYSIS_NOW)
    private readonly now: () => number = Date.now,
  ) {}

  async tryAcquireLock(
    context: AnalysisRequestContext,
    canonicalHash: string,
    lockTtlMs = 10_000,
  ): Promise<DedupeLockDecision> {
    const key = this.buildLockKey(context, canonicalHash);
    const acquired = await this.store.setNx(key, context.requestId, lockTtlMs);

    return { acquired, key };
  }

  async releaseLock(
    context: AnalysisRequestContext,
    canonicalHash: string,
  ): Promise<void> {
    await this.store.compareAndDelete(
      this.buildLockKey(context, canonicalHash),
      context.requestId,
    );
  }

  async checkAntiBotHeuristic(
    context: AnalysisRequestContext,
    canonicalHash: string,
    options: AntiBotHeuristicOptions = {},
  ): Promise<AntiBotHeuristicDecision> {
    const shortIntervalMs = options.shortIntervalMs ?? 3_000;
    const repetitionThreshold = options.repetitionThreshold ?? 6;
    const stateTtlMs =
      options.stateTtlMs ?? Math.max(shortIntervalMs * 4, 30_000);
    const key = this.buildAntiBotKey(context, canonicalHash);
    const now = this.now();
    const existing = await this.store.get<AntiBotState>(key);
    const withinShortInterval =
      existing !== null && now - existing.lastSeenAt <= shortIntervalMs;
    const count = withinShortInterval ? existing.count + 1 : 1;

    await this.store.set<AntiBotState>(
      key,
      { count, lastSeenAt: now },
      stateTtlMs,
    );

    return {
      blocked: count >= repetitionThreshold,
      count,
    };
  }

  buildCanonicalHash(payload: unknown): string {
    const normalizedPayload = this.normalizePayload(payload);

    return createHash("sha256")
      .update(JSON.stringify(normalizedPayload))
      .digest("hex");
  }

  async getCachedResult<T>(
    context: AnalysisRequestContext,
    canonicalHash: string,
  ): Promise<T | null> {
    return this.store.get<T>(this.buildCacheKey(context, canonicalHash));
  }

  async setCachedResult<T>(
    context: AnalysisRequestContext,
    canonicalHash: string,
    payload: T,
    cacheTtlMs = 300_000,
  ): Promise<void> {
    await this.store.set<T>(
      this.buildCacheKey(context, canonicalHash),
      payload,
      cacheTtlMs,
    );
  }

  private buildLockKey(context: AnalysisRequestContext, canonicalHash: string) {
    return `analysis:dedupe:lock:${this.resolveScope(context)}:${canonicalHash}`;
  }

  private buildAntiBotKey(
    context: AnalysisRequestContext,
    canonicalHash: string,
  ) {
    return `analysis:dedupe:antibot:${this.resolveScope(context)}:${canonicalHash}`;
  }

  private buildCacheKey(
    context: AnalysisRequestContext,
    canonicalHash: string,
  ) {
    return `analysis:dedupe:cache:${this.resolveScope(context)}:${canonicalHash}`;
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

  private normalizePayload(payload: unknown): unknown {
    if (Array.isArray(payload)) {
      return payload.map((item) => this.normalizePayload(item));
    }

    if (payload && typeof payload === "object") {
      const entries = Object.entries(payload as Record<string, unknown>)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, this.normalizePayload(value)]);

      return Object.fromEntries(entries);
    }

    return payload;
  }
}
