import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import type { RecordBusinessFunnelEventInput } from "../analysis-observability/business-funnel-event.service";
import type { BusinessFunnelEventSource } from "../analysis-observability/business-funnel-event-ownership";
import { PosthogEventExporter } from "./posthog-event-exporter.service";

@Injectable()
export class BusinessFunnelPosthogConsumer {
  private readonly logger = new Logger(BusinessFunnelPosthogConsumer.name);

  constructor(
    @Inject(PosthogEventExporter)
    private readonly exporter: PosthogEventExporter,
  ) {}

  shouldExport(eventName: string): boolean {
    return this.exporter.shouldExportBusinessFunnelEvent(eventName);
  }

  onBusinessFunnelEventRecorded(
    eventName: string,
    input: RecordBusinessFunnelEventInput,
    context: AnalysisRequestContext,
    source: BusinessFunnelEventSource,
  ): void {
    if (!this.shouldExport(eventName)) {
      return;
    }

    try {
      const properties = {
        event_version: input.eventVersion,
        request_id: input.requestId ?? context.requestId,
        correlation_id: input.correlationId ?? context.correlationId,
        session_internal_id: context.sessionInternalId,
        user_id: context.userId,
        route_key: input.routeKey,
        ...input.metadata,
      };

      this.exporter.exportBusinessFunnelEvent(
        eventName as any,
        properties,
        source === "frontend" ? "frontend" : "backend",
      );
    } catch (error) {
      this.logger.warn(
        `Failed to export business funnel event ${eventName} to PostHog: ${error}`,
      );
    }
  }
}