import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import { DatabaseService } from "../database/database.service";
import { BusinessFunnelProjectionService } from "./business-funnel-projection.service";

export type RecordBusinessFunnelEventInput = {
  correlationId?: string;
  eventName: string;
  eventVersion: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  routeKey?: string | null;
};

type BusinessFunnelEventWriteClient = {
  businessFunnelEvent: {
    create: (args: {
      data: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
    findUnique: (args: {
      where: { idempotencyKey: string };
    }) => Promise<Record<string, unknown> | null>;
  };
};

const PROTECTION_SEMANTIC_EVENT_PREFIXES = [
  "abuse_",
  "cache_",
  "canonical_hash_",
  "cooldown_",
  "daily_limit_",
  "dedupe_",
  "duplicate_request_",
  "kill_switch_",
  "openai_request_",
  "payload_",
  "rate_limit_",
  "turnstile_",
  "usage_policy_",
] as const;

@Injectable()
export class BusinessFunnelEventService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(BusinessFunnelProjectionService)
    private readonly projection: BusinessFunnelProjectionService,
  ) {}

  async record(
    input: RecordBusinessFunnelEventInput,
    context: AnalysisRequestContext,
  ) {
    const normalizedEventName = this.assertValidInput(input);

    const normalizedKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const eventData = {
      correlationId: context.correlationId,
      eventName: normalizedEventName,
      eventVersion: input.eventVersion,
      metadataJson: this.toMetadataJson(input.metadata),
      requestId: context.requestId,
      routeKey: input.routeKey ?? null,
      sessionInternalId: context.sessionInternalId,
      userId: context.userId,
    };

    return this.database.$transaction(async (tx) => {
      const writeClient = tx as unknown as BusinessFunnelEventWriteClient;

      if (normalizedKey) {
        try {
          const created = await writeClient.businessFunnelEvent.create({
            data: {
              ...eventData,
              idempotencyKey: normalizedKey,
            },
          });

          await this.projection.applyEvent(created as any, tx as any);

          return {
            event: created,
            ingested: true,
          };
        } catch (error) {
          if (!this.isUniqueViolation(error)) {
            throw error;
          }

          const existing = await writeClient.businessFunnelEvent.findUnique({
            where: { idempotencyKey: normalizedKey },
          });

          if (!existing) {
            throw error;
          }

          return {
            event: existing,
            ingested: false,
          };
        }
      }

      const created = await writeClient.businessFunnelEvent.create({
        data: {
          ...eventData,
          idempotencyKey: null,
        },
      });

      await this.projection.applyEvent(created as any, tx as any);

      return {
        event: created,
        ingested: true,
      };
    });
  }

  private assertValidInput(input: RecordBusinessFunnelEventInput) {
    if (typeof input.eventName !== "string" || !input.eventName.trim()) {
      throw new BadRequestException("eventName is required");
    }

    const normalizedEventName = this.normalizeEventName(input.eventName);

    if (!Number.isInteger(input.eventVersion) || input.eventVersion < 1) {
      throw new BadRequestException("eventVersion must be a positive integer");
    }

    if (this.isReservedProtectionSemanticEvent(normalizedEventName)) {
      throw new BadRequestException(
        "business funnel event name is reserved for protection semantics",
      );
    }

    return normalizedEventName;
  }

  private normalizeEventName(eventName: string) {
    return eventName.trim().toLowerCase();
  }

  private isReservedProtectionSemanticEvent(eventName: string) {
    return PROTECTION_SEMANTIC_EVENT_PREFIXES.some((prefix) =>
      eventName.startsWith(prefix),
    );
  }

  private isUniqueViolation(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }

  private normalizeIdempotencyKey(key?: string) {
    const normalized = key?.trim();

    if (!normalized) {
      return null;
    }

    return normalized;
  }

  private toMetadataJson(metadata: Record<string, unknown> | undefined) {
    if (!metadata) {
      return undefined;
    }

    const entries = Object.entries(metadata)
      .filter(([key]) => key !== "sessionPublicToken")
      .map(([key, value]) => [key, this.toJsonValue(value)])
      .filter((entry): entry is [string, Prisma.InputJsonValue] => {
        return entry[1] !== undefined;
      });

    if (entries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(entries) as Prisma.InputJsonValue;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === null || value === undefined) {
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
        .map((entry) => this.toJsonValue(entry))
        .filter((entry): entry is Prisma.InputJsonValue => entry !== undefined);
    }

    if (typeof value === "object") {
      const nested = Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "sessionPublicToken")
        .map(([key, nestedValue]) => [key, this.toJsonValue(nestedValue)])
        .filter((entry): entry is [string, Prisma.InputJsonValue] => {
          return entry[1] !== undefined;
        });

      if (nested.length === 0) {
        return undefined;
      }

      return Object.fromEntries(nested) as Prisma.InputJsonValue;
    }

    return undefined;
  }
}
