import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import type { BusinessFunnelEventName } from "../analysis-observability/analysis-event-version.registry";
import type { AnalysisProtectionEventName } from "../analysis-observability/analysis-event-version.registry";
import type { PostHogEventSource } from "./types";

const BUSINESS_FUNNEL_EVENT_EMITTED = "posthog:business-funnel-event-emitted";
const PROTECTION_EVENT_EMITTED = "posthog:protection-event-emitted";

interface BusinessFunnelEventPayload {
  eventName: BusinessFunnelEventName;
  properties: Record<string, unknown>;
  source: PostHogEventSource;
}

interface ProtectionEventPayload {
  eventName: AnalysisProtectionEventName;
  properties: Record<string, unknown>;
}

@Injectable()
export class PosthogEventListener {
  private readonly logger = new Logger(PosthogEventListener.name);

  constructor(
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(BUSINESS_FUNNEL_EVENT_EMITTED)
  handleBusinessFunnelEvent(payload: BusinessFunnelEventPayload) {
    if (!payload.properties || typeof payload.properties !== "object") {
      return;
    }

    this.logger.debug(
      `Received business funnel event: ${payload.eventName}`,
    );
  }

  @OnEvent(PROTECTION_EVENT_EMITTED)
  handleProtectionEvent(payload: ProtectionEventPayload) {
    if (!payload.properties || typeof payload.properties !== "object") {
      return;
    }

    this.logger.debug(`Received protection event: ${payload.eventName}`);
  }

  emitBusinessFunnelEvent(
    eventName: BusinessFunnelEventName,
    properties: Record<string, unknown>,
    source: PostHogEventSource,
  ) {
    this.eventEmitter.emit(BUSINESS_FUNNEL_EVENT_EMITTED, {
      eventName,
      properties,
      source,
    });
  }

  emitProtectionEvent(
    eventName: AnalysisProtectionEventName,
    properties: Record<string, unknown>,
  ) {
    this.eventEmitter.emit(PROTECTION_EVENT_EMITTED, {
      eventName,
      properties,
    });
  }
}