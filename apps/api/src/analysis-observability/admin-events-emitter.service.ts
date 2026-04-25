import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { AnalysisTelemetryService } from "../analysis-protection/analysis-telemetry.service";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import {
  type AdminEventCatalogItem,
  type AdminEventDomain,
  type AdminEventsCatalog,
  buildAdminEventsCatalog,
} from "./admin-events-catalog";
import type {
  AnalysisProtectionEventName,
  BusinessFunnelEventName,
} from "./analysis-event-version.registry";
import { BusinessFunnelEventService } from "./business-funnel-event.service";
import { FUNNEL_EVENT_OWNERSHIP } from "./business-funnel-event-ownership";

export type AdminEventsEmitMode = "single" | "group" | "all";

export type EmitAdminEventsInput = {
  mode: AdminEventsEmitMode;
  eventName?: string;
  group?: AdminEventDomain;
};

export type AdminEventsEmitResult = {
  eventName: string;
  domain: AdminEventDomain;
  status: "sent" | "failed";
  error?: string;
};

export type AdminEventsEmitSummary = {
  requested: number;
  sent: number;
  failed: number;
  results: AdminEventsEmitResult[];
};

type TargetEvent = AdminEventCatalogItem & { domain: AdminEventDomain };

@Injectable()
export class AdminEventsEmitterService {
  constructor(
    @Inject(BusinessFunnelEventService)
    private readonly businessFunnelEventService: BusinessFunnelEventService,
    @Inject(AnalysisTelemetryService)
    private readonly analysisTelemetryService: AnalysisTelemetryService,
  ) {}

  buildCatalog(): AdminEventsCatalog {
    return buildAdminEventsCatalog();
  }

  async emit(
    input: EmitAdminEventsInput,
    context: AnalysisRequestContext,
  ): Promise<AdminEventsEmitSummary> {
    const targets = this.resolveTargets(input);
    const results: AdminEventsEmitResult[] = [];

    for (const [index, target] of targets.entries()) {
      const idempotencyKey = this.buildIdempotencyKey(target, context, index);

      try {
        if (target.domain === "business") {
          const owner =
            FUNNEL_EVENT_OWNERSHIP[target.eventName as BusinessFunnelEventName];

          if (!owner) {
            throw new BadRequestException(
              `business funnel event is missing ownership registry entry: ${target.eventName}`,
            );
          }

          await this.businessFunnelEventService.record(
            {
              eventName: target.eventName,
              eventVersion: target.eventVersion,
              idempotencyKey,
              metadata: { synthetic: true },
            },
            context,
            owner,
          );
        } else {
          await this.analysisTelemetryService.emit(
            target.eventName as AnalysisProtectionEventName,
            context,
            {
              metadata: { synthetic: true },
            },
          );
        }

        results.push({
          domain: target.domain,
          eventName: target.eventName,
          status: "sent",
        });
      } catch (error) {
        results.push({
          domain: target.domain,
          eventName: target.eventName,
          status: "failed",
          error: this.toErrorMessage(error),
        });
      }
    }

    const failed = results.filter(
      (result) => result.status === "failed",
    ).length;

    return {
      requested: targets.length,
      sent: results.length - failed,
      failed,
      results,
    };
  }

  private resolveTargets(input: EmitAdminEventsInput): TargetEvent[] {
    const catalog = this.buildCatalog();

    if (input.mode === "single") {
      const normalizedName = input.eventName?.trim();

      if (!normalizedName) {
        throw new BadRequestException("eventName is required for single mode");
      }

      const protectionMatch = catalog.protection.find(
        (event) => event.eventName === normalizedName,
      );
      if (protectionMatch) {
        return [{ ...protectionMatch, domain: "protection" }];
      }

      const businessMatch = catalog.business.find(
        (event) => event.eventName === normalizedName,
      );
      if (businessMatch) {
        return [{ ...businessMatch, domain: "business" }];
      }

      throw new BadRequestException(
        `eventName is not present in registries: ${normalizedName}`,
      );
    }

    if (input.mode === "group") {
      if (!input.group) {
        throw new BadRequestException("group is required for group mode");
      }

      if (input.group === "protection") {
        return catalog.protection.map((event) => ({
          ...event,
          domain: "protection",
        }));
      }

      if (input.group === "business") {
        return catalog.business.map((event) => ({
          ...event,
          domain: "business",
        }));
      }

      throw new BadRequestException(
        `group must be one of: protection, business. received: ${String(input.group)}`,
      );
    }

    if (input.mode === "all") {
      return [
        ...catalog.protection.map((event) => ({
          ...event,
          domain: "protection" as const,
        })),
        ...catalog.business.map((event) => ({
          ...event,
          domain: "business" as const,
        })),
      ];
    }

    throw new BadRequestException(
      `mode must be one of: single, group, all. received: ${String(input.mode)}`,
    );
  }

  private buildIdempotencyKey(
    target: TargetEvent,
    context: AnalysisRequestContext,
    index: number,
  ) {
    return [
      "admin_synthetic",
      context.requestId,
      target.domain,
      target.eventName,
      `${Date.now()}-${index}`,
      randomUUID(),
    ].join(":");
  }

  private toErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
