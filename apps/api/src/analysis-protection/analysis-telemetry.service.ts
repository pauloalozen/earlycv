import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  type AnalysisProtectionEventName,
  resolveAnalysisProtectionEventVersion,
} from "../analysis-observability/analysis-event-version.registry";
import { sanitizeAnalyticsPayload } from "../common/analytics-sanitization";
import { DatabaseService } from "../database/database.service";
import { PosthogEventExporter } from "../posthog-integration/posthog-event-exporter.service";
import type { AnalysisRequestContext } from "./types";

export type AnalysisTelemetryEventName = AnalysisProtectionEventName;

export type AnalysisTelemetryInput = {
  eventName: AnalysisTelemetryEventName;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  routeKey?: string | null;
};

@Injectable()
export class AnalysisTelemetryService {
  private readonly logger = new Logger(AnalysisTelemetryService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PosthogEventExporter)
    private readonly posthogExporter: PosthogEventExporter,
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
      eventVersion: resolveAnalysisProtectionEventVersion(eventName),
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

    this.exportToPostHog(eventName, input, context);
  }

  private exportToPostHog(
    eventName: AnalysisTelemetryEventName,
    input: Omit<AnalysisTelemetryInput, "eventName">,
    context: AnalysisRequestContext,
  ) {
    if (!this.posthogExporter.shouldExportProtectionEvent(eventName)) {
      return;
    }

    const sanitizedMetadata = sanitizeAnalyticsPayload(input.metadata ?? {});

    const properties = {
      request_id: context.requestId,
      correlation_id: context.correlationId,
      session_internal_id: context.sessionInternalId,
      user_id: context.userId,
      route_key: input.routeKey,
      source: "backend",
      ...sanitizedMetadata,
    };

    this.posthogExporter.exportProtectionEvent(
      eventName,
      properties,
      "backend",
    );
  }

  private toMetadataJson(metadata: Record<string, unknown> | undefined) {
    if (!metadata) {
      return undefined;
    }

    const scrubbed = this.scrubMetadataValue(sanitizeAnalyticsPayload(metadata));

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
