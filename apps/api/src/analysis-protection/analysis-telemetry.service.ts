import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { DatabaseService } from "../database/database.service";
import type { AnalysisRequestContext } from "./types";

export type AnalysisTelemetryEventName =
  | "abuse_detected"
  | "cache_hit"
  | "cache_miss"
  | "canonical_hash_generated"
  | "cooldown_block"
  | "daily_limit_block"
  | "dedupe_lock_acquired"
  | "duplicate_request_blocked"
  | "kill_switch_blocked"
  | "kill_switch_passed"
  | "openai_request_failed"
  | "openai_request_started"
  | "openai_request_success"
  | "payload_invalid"
  | "payload_valid"
  | "rate_limit_block_contextual"
  | "rate_limit_block_initial"
  | "rate_limit_contextual_passed"
  | "rate_limit_raw_passed"
  | "turnstile_expired"
  | "turnstile_invalid"
  | "turnstile_missing"
  | "turnstile_unavailable"
  | "turnstile_unconfigured"
  | "turnstile_valid"
  | "usage_policy_passed";

export type AnalysisTelemetryInput = {
  eventName: AnalysisTelemetryEventName;
  eventVersion?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  routeKey?: string | null;
};

@Injectable()
export class AnalysisTelemetryService {
  private readonly logger = new Logger(AnalysisTelemetryService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async emit(
    eventName: AnalysisTelemetryEventName,
    context: AnalysisRequestContext,
    input: Omit<AnalysisTelemetryInput, "eventName"> = {},
  ): Promise<void> {
    const metadataJson = this.toMetadataJson(input.metadata);
    const payload = {
      correlationId: context.correlationId,
      eventName,
      eventVersion: input.eventVersion ?? 1,
      metadataJson,
      requestId: context.requestId,
      routeKey: input.routeKey ?? null,
      sessionInternalId: context.sessionInternalId,
      userId: context.userId,
    };

    try {
      if (input.idempotencyKey) {
        await this.database.analysisProtectionEvent.upsert({
          create: {
            ...payload,
            idempotencyKey: input.idempotencyKey,
          },
          update: {},
          where: { idempotencyKey: input.idempotencyKey },
        });

        return;
      }

      await this.database.analysisProtectionEvent.create({
        data: {
          ...payload,
          idempotencyKey: null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist analysis telemetry event ${eventName}: ${String(error)}`,
      );
    }
  }

  private toMetadataJson(metadata: Record<string, unknown> | undefined) {
    if (!metadata) {
      return undefined;
    }

    const scrubbed = this.scrubMetadataValue(metadata);

    if (!scrubbed || Array.isArray(scrubbed) || typeof scrubbed !== "object") {
      return undefined;
    }

    return scrubbed;
  }

  private scrubMetadataValue(
    value: unknown,
  ): Prisma.InputJsonValue | undefined {
    if (value === null) {
      return undefined;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((entry) => this.scrubMetadataValue(entry))
        .filter((entry): entry is Prisma.InputJsonValue => entry !== undefined);
    }

    if (typeof value === "object") {
      const cleanedEntries = Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "sessionPublicToken")
        .map(([key, nestedValue]) => [
          key,
          this.scrubMetadataValue(nestedValue),
        ])
        .filter((entry): entry is [string, Prisma.InputJsonValue] => {
          return entry[1] !== undefined;
        });

      if (cleanedEntries.length === 0) {
        return undefined;
      }

      return Object.fromEntries(cleanedEntries) as Prisma.InputJsonValue;
    }

    return undefined;
  }
}
