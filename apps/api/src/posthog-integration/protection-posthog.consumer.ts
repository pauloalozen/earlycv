import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import type { AnalysisTelemetryInput } from "../analysis-protection/analysis-telemetry.service";
import { PosthogEventExporter } from "./posthog-event-exporter.service";

@Injectable()
export class ProtectionPosthogConsumer {
  private readonly logger = new Logger(ProtectionPosthogConsumer.name);

  constructor(
    @Inject(PosthogEventExporter)
    private readonly exporter: PosthogEventExporter,
  ) {}

  shouldExport(eventName: string): boolean {
    return this.exporter.shouldExportProtectionEvent(eventName);
  }

  onProtectionEventEmitted(
    eventName: string,
    input: AnalysisTelemetryInput,
    context: AnalysisRequestContext,
  ): void {
    if (!this.shouldExport(eventName)) {
      return;
    }

    try {
      const properties = {
        request_id: context.requestId,
        correlation_id: context.correlationId,
        session_internal_id: context.sessionInternalId,
        user_id: context.userId,
        route_key: input.routeKey,
        ...input.metadata,
      };

      this.exporter.exportProtectionEvent(
        eventName as any,
        properties,
        "backend",
      );
    } catch (error) {
      this.logger.warn(
        `Failed to export protection event ${eventName} to PostHog: ${error}`,
      );
    }
  }
}