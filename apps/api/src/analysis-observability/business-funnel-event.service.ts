import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import { sanitizeAnalyticsPayload } from "../common/analytics-sanitization";
import { DatabaseService } from "../database/database.service";
import { PosthogEventExporter } from "../posthog-integration/posthog-event-exporter.service";
import { resolveBusinessFunnelEventVersion } from "./analysis-event-version.registry";
import {
  type BusinessFunnelEventSource,
  FUNNEL_EVENT_OWNERSHIP,
} from "./business-funnel-event-ownership";
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
    createMany: (args: {
      data: Record<string, unknown>[];
      skipDuplicates?: boolean;
    }) => Promise<{ count: number }>;
    findUnique: (args: {
      where: { idempotencyKey: string };
    }) => Promise<Record<string, unknown> | null>;
  };
};

type BusinessFunnelPosthogExporter = {
  exportBusinessFunnelEvent: (
    eventName: string,
    properties: Record<string, unknown>,
    source: "frontend" | "backend",
  ) => void;
  shouldExportBusinessFunnelEvent: (eventName: string) => boolean;
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

const NOOP_POSTHOG_EXPORTER = {
  exportBusinessFunnelEvent: () => {},
  shouldExportBusinessFunnelEvent: () => false,
} satisfies BusinessFunnelPosthogExporter;

@Injectable()
export class BusinessFunnelEventService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(BusinessFunnelProjectionService)
    private readonly projection: BusinessFunnelProjectionService,
    @Inject(PosthogEventExporter)
    private readonly posthogExporter: BusinessFunnelPosthogExporter = NOOP_POSTHOG_EXPORTER,
  ) {}

  async record(
    input: RecordBusinessFunnelEventInput,
    context: AnalysisRequestContext,
    source: BusinessFunnelEventSource = "frontend",
  ) {
    const { normalizedEventName, resolvedVersion } = this.assertValidInput(
      input,
      source,
    );

    const normalizedKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const eventData = {
      correlationId: context.correlationId,
      eventName: normalizedEventName,
      eventVersion: resolvedVersion,
      metadataJson: this.toMetadataJson(input.metadata),
      requestId: context.requestId,
      routeKey: input.routeKey ?? null,
      sessionInternalId: context.sessionInternalId,
      userId: context.userId,
    };

    if (normalizedKey) {
      return await this.database.$transaction(async (tx) => {
        const writeClient = tx as unknown as BusinessFunnelEventWriteClient;
        const result = await this.createManyWithUserFallback(writeClient, [
          { ...eventData, idempotencyKey: normalizedKey },
        ]);

        const ingested = result.count === 1;
        const event = await writeClient.businessFunnelEvent.findUnique({
          where: { idempotencyKey: normalizedKey },
        });

        if (!event) {
          throw new Error(`Event not found after createMany: ${normalizedKey}`);
        }

        if (ingested) {
          // biome-ignore lint/suspicious/noExplicitAny: Prisma tx and event types don't match projection interface
          await this.projection.applyEvent(event as any, tx as any);
          this.exportToPostHog(normalizedEventName, input, context, source);
        }

        return { event, ingested };
      });
    }

    return this.database.$transaction(async (tx) => {
      const writeClient = tx as unknown as BusinessFunnelEventWriteClient;
      const created = await this.createWithUserFallback(writeClient, {
        ...eventData,
        idempotencyKey: null,
      });

      // biome-ignore lint/suspicious/noExplicitAny: Prisma tx and event types don't match projection interface
      await this.projection.applyEvent(created as any, tx as any);
      this.exportToPostHog(normalizedEventName, input, context, source);

      return {
        event: created,
        ingested: true,
      };
    });
  }

  private async createManyWithUserFallback(
    writeClient: BusinessFunnelEventWriteClient,
    data: Record<string, unknown>[],
  ): Promise<{ count: number }> {
    try {
      return await writeClient.businessFunnelEvent.createMany({
        data,
        skipDuplicates: true,
      });
    } catch (error) {
      if (!this.isUserForeignKeyViolation(error) || data.length !== 1) {
        throw error;
      }

      const retried = [{ ...data[0], userId: null }];
      return await writeClient.businessFunnelEvent.createMany({
        data: retried,
        skipDuplicates: true,
      });
    }
  }

  private async createWithUserFallback(
    writeClient: BusinessFunnelEventWriteClient,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      return await writeClient.businessFunnelEvent.create({ data });
    } catch (error) {
      if (!this.isUserForeignKeyViolation(error)) {
        throw error;
      }

      return await writeClient.businessFunnelEvent.create({
        data: {
          ...data,
          userId: null,
        },
      });
    }
  }

  private isUserForeignKeyViolation(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const code = (error as { code?: unknown }).code;
    const constraint = (error as { meta?: { constraint?: unknown } }).meta
      ?.constraint;

    return code === "P2003" && constraint === "BusinessFunnelEvent_userId_fkey";
  }

  private assertValidInput(
    input: RecordBusinessFunnelEventInput,
    source: BusinessFunnelEventSource,
  ) {
    if (typeof input.eventName !== "string" || !input.eventName.trim()) {
      throw new BadRequestException("eventName is required");
    }

    const normalizedEventName = this.normalizeEventName(input.eventName);

    if (this.isReservedProtectionSemanticEvent(normalizedEventName)) {
      throw new BadRequestException(
        "business funnel event name is reserved for protection semantics",
      );
    }

    const versionFromRegistry =
      resolveBusinessFunnelEventVersion(normalizedEventName);

    if (versionFromRegistry === null) {
      throw new BadRequestException(
        `business funnel event is missing from event version registry: ${normalizedEventName}`,
      );
    }

    if (!Number.isInteger(input.eventVersion) || input.eventVersion < 1) {
      throw new BadRequestException("eventVersion must be a positive integer");
    }

    if (input.eventVersion !== versionFromRegistry) {
      throw new BadRequestException(
        `eventVersion mismatch for ${normalizedEventName}: expected ${versionFromRegistry}, received ${input.eventVersion}`,
      );
    }

    const ownershipKey =
      normalizedEventName as keyof typeof FUNNEL_EVENT_OWNERSHIP;
    const owner = FUNNEL_EVENT_OWNERSHIP[ownershipKey];

    if (!owner) {
      throw new BadRequestException(
        `business funnel event is missing ownership registry entry: ${normalizedEventName}`,
      );
    }

    if (owner !== source) {
      throw new BadRequestException(
        `business funnel event ownership mismatch for ${normalizedEventName}: owner is ${owner}, source is ${source}`,
      );
    }

    return {
      normalizedEventName,
      resolvedVersion: versionFromRegistry,
    };
  }

  private normalizeEventName(eventName: string) {
    return eventName.trim().toLowerCase();
  }

  private isReservedProtectionSemanticEvent(eventName: string) {
    return PROTECTION_SEMANTIC_EVENT_PREFIXES.some((prefix) =>
      eventName.startsWith(prefix),
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

    const sanitizedMetadata = sanitizeAnalyticsPayload(metadata);

    const entries = Object.entries(sanitizedMetadata)
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

  private exportToPostHog(
    eventName: string,
    input: RecordBusinessFunnelEventInput,
    context: AnalysisRequestContext,
    source: BusinessFunnelEventSource,
  ) {
    if (!this.posthogExporter.shouldExportBusinessFunnelEvent(eventName)) {
      return;
    }

    const sanitizedMetadata = sanitizeAnalyticsPayload(input.metadata ?? {});

    const properties = {
      event_version: input.eventVersion,
      request_id: input.requestId ?? context.requestId,
      correlation_id: input.correlationId ?? context.correlationId,
      sessionInternalId: context.sessionInternalId,
      user_id: context.userId,
      route_key: input.routeKey,
      source: source === "frontend" ? "frontend" : "backend",
      ...sanitizedMetadata,
      ...(context.posthogSessionId
        ? { $session_id: context.posthogSessionId }
        : {}),
    };

    this.posthogExporter.exportBusinessFunnelEvent(
      // biome-ignore lint/suspicious/noExplicitAny: eventName union doesn't satisfy PostHog exporter signature
      eventName as any,
      properties,
      source === "frontend" ? "frontend" : "backend",
    );
  }
}
