import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException } from "@nestjs/common";

import type { AnalysisTelemetryService } from "../analysis-protection/analysis-telemetry.service";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import { AdminEventsEmitterService } from "./admin-events-emitter.service";
import {
  ANALYSIS_PROTECTION_EVENT_VERSION_MAP,
  BUSINESS_FUNNEL_EVENT_VERSION_MAP,
} from "./analysis-event-version.registry";
import type { BusinessFunnelEventService } from "./business-funnel-event.service";
import { FUNNEL_EVENT_OWNERSHIP } from "./business-funnel-event-ownership";

type BusinessFunnelServiceStub = {
  record: (
    input: Record<string, unknown>,
    context: AnalysisRequestContext,
    source: string,
  ) => Promise<unknown>;
};

type AnalysisTelemetryServiceStub = {
  emit: (
    eventName: string,
    context: AnalysisRequestContext,
    input?: { metadata?: Record<string, unknown>; idempotencyKey?: string },
  ) => Promise<void>;
};

function buildService(
  businessStub: BusinessFunnelServiceStub,
  telemetryStub: AnalysisTelemetryServiceStub,
) {
  return new AdminEventsEmitterService(
    businessStub as unknown as BusinessFunnelEventService,
    telemetryStub as unknown as AnalysisTelemetryService,
  );
}

const context: AnalysisRequestContext = {
  correlationId: "corr-1",
  ip: "203.0.113.10",
  requestId: "req-1",
  routePath: "/api/admin/analysis-observability/events/emit",
  sessionInternalId: "session-1",
  sessionPublicToken: null,
  userAgentHash: "ua-1",
  userId: "user-1",
};

test("buildCatalog returns all protection and business events from registries", () => {
  const service = buildService(
    { record: async () => ({}) },
    { emit: async () => {} },
  );

  const catalog = service.buildCatalog();

  assert.equal(
    catalog.protection.length,
    Object.keys(ANALYSIS_PROTECTION_EVENT_VERSION_MAP).length,
  );
  assert.equal(
    catalog.business.length,
    Object.keys(BUSINESS_FUNNEL_EVENT_VERSION_MAP).length,
  );
  assert.deepEqual(
    catalog.protection.find((event) => event.eventName === "payload_valid"),
    {
      eventName: "payload_valid",
      eventVersion: 1,
    },
  );
  assert.deepEqual(
    catalog.business.find((event) => event.eventName === "page_view"),
    {
      eventName: "page_view",
      eventVersion: 1,
    },
  );
  assert.deepEqual(
    catalog.business.find((event) => event.eventName === "buy_credits_clicked"),
    {
      eventName: "buy_credits_clicked",
      eventVersion: 1,
    },
  );
  assert.deepEqual(
    catalog.business.find((event) => event.eventName === "plan_selected"),
    {
      eventName: "plan_selected",
      eventVersion: 1,
    },
  );
  assert.deepEqual(
    catalog.business.find(
      (event) => event.eventName === "auth_oauth_redirect_started",
    ),
    {
      eventName: "auth_oauth_redirect_started",
      eventVersion: 1,
    },
  );
  assert.deepEqual(
    catalog.business.find(
      (event) => event.eventName === "auth_session_identified",
    ),
    {
      eventName: "auth_session_identified",
      eventVersion: 1,
    },
  );
  assert.deepEqual(
    catalog.business.find((event) => event.eventName === "cv_unlock_completed"),
    {
      eventName: "cv_unlock_completed",
      eventVersion: 1,
    },
  );
});

test("emit single business event sends synthetic metadata with ownership source", async () => {
  const recordCalls: Array<{
    input: Record<string, unknown>;
    source: string;
  }> = [];

  const service = buildService(
    {
      record: async (
        input: Record<string, unknown>,
        _context: AnalysisRequestContext,
        source: string,
      ) => {
        recordCalls.push({ input, source });
      },
    },
    { emit: async () => {} },
  );

  const summary = await service.emit(
    {
      mode: "single",
      eventName: "analyze_submit_clicked",
    },
    context,
  );

  assert.equal(summary.requested, 1);
  assert.equal(summary.sent, 1);
  assert.equal(summary.failed, 0);
  assert.deepEqual(summary.results, [
    {
      domain: "business",
      eventName: "analyze_submit_clicked",
      status: "sent",
    },
  ]);

  assert.equal(recordCalls.length, 1);
  assert.equal(recordCalls[0].input.eventName, "analyze_submit_clicked");
  assert.equal(
    recordCalls[0].input.eventVersion,
    BUSINESS_FUNNEL_EVENT_VERSION_MAP.analyze_submit_clicked,
  );
  assert.equal(
    (recordCalls[0].input.metadata as { synthetic?: boolean }).synthetic,
    true,
  );
  assert.equal(
    recordCalls[0].source,
    FUNNEL_EVENT_OWNERSHIP.analyze_submit_clicked,
  );
  assert.equal(typeof recordCalls[0].input.idempotencyKey, "string");
});

test("emit group protection processes all and returns partial failures", async () => {
  const telemetryCalls: Array<{
    eventName: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  }> = [];

  const failingEvent = "payload_invalid";

  const service = buildService(
    { record: async () => ({}) },
    {
      emit: async (
        eventName: string,
        _context: AnalysisRequestContext,
        input: { metadata?: Record<string, unknown>; idempotencyKey?: string },
      ) => {
        telemetryCalls.push({
          eventName,
          idempotencyKey: input.idempotencyKey,
          metadata: input.metadata,
        });

        if (eventName === failingEvent) {
          throw new Error("synthetic protection failure");
        }
      },
    },
  );

  const summary = await service.emit(
    {
      group: "protection",
      mode: "group",
    },
    context,
  );

  const expectedTotal = Object.keys(
    ANALYSIS_PROTECTION_EVENT_VERSION_MAP,
  ).length;

  assert.equal(summary.requested, expectedTotal);
  assert.equal(summary.failed, 1);
  assert.equal(summary.sent, expectedTotal - 1);
  assert.equal(summary.results.length, expectedTotal);
  assert.equal(
    summary.results.some(
      (item) =>
        item.eventName === failingEvent &&
        item.domain === "protection" &&
        item.status === "failed" &&
        item.error === "synthetic protection failure",
    ),
    true,
  );
  assert.equal(
    summary.results.some(
      (item) =>
        item.eventName === "payload_valid" &&
        item.domain === "protection" &&
        item.status === "sent",
    ),
    true,
  );

  assert.equal(telemetryCalls.length, expectedTotal);
  for (const call of telemetryCalls) {
    assert.equal(call.metadata?.synthetic, true);
    assert.equal(call.idempotencyKey, undefined);
  }
});

test("emit all mode exercises protection and business paths with coherent summary", async () => {
  const telemetryCalls: Array<{ eventName: string }> = [];
  const recordCalls: Array<{ eventName: string; source: string }> = [];

  const service = buildService(
    {
      record: async (
        input: { eventName: string },
        _context: AnalysisRequestContext,
        source: string,
      ) => {
        recordCalls.push({ eventName: input.eventName, source });
      },
    },
    {
      emit: async (eventName: string) => {
        telemetryCalls.push({ eventName });
      },
    },
  );

  const summary = await service.emit({ mode: "all" }, context);

  const expectedProtection = Object.keys(
    ANALYSIS_PROTECTION_EVENT_VERSION_MAP,
  ).length;
  const expectedBusiness = Object.keys(
    BUSINESS_FUNNEL_EVENT_VERSION_MAP,
  ).length;
  const expectedRequested = expectedProtection + expectedBusiness;

  assert.equal(summary.requested, expectedRequested);
  assert.equal(summary.sent, expectedRequested);
  assert.equal(summary.failed, 0);
  assert.equal(summary.results.length, expectedRequested);

  assert.equal(telemetryCalls.length, expectedProtection);
  assert.equal(recordCalls.length, expectedBusiness);

  assert.equal(
    summary.results.some(
      (result) => result.domain === "protection" && result.status === "sent",
    ),
    true,
  );
  assert.equal(
    summary.results.some(
      (result) => result.domain === "business" && result.status === "sent",
    ),
    true,
  );

  for (const call of recordCalls) {
    assert.equal(
      FUNNEL_EVENT_OWNERSHIP[
        call.eventName as keyof typeof FUNNEL_EVENT_OWNERSHIP
      ],
      call.source,
    );
  }
});

test("emit rejects invalid single event names", async () => {
  const service = buildService(
    { record: async () => ({}) },
    { emit: async () => {} },
  );

  await assert.rejects(
    service.emit({ mode: "single", eventName: "not_in_registry" }, context),
    BadRequestException,
  );
});

test("emit rejects single mode without eventName", async () => {
  const service = buildService(
    { record: async () => ({}) },
    { emit: async () => {} },
  );

  await assert.rejects(
    service.emit({ mode: "single" }, context),
    BadRequestException,
  );
});

test("emit rejects group mode without group", async () => {
  const service = buildService(
    { record: async () => ({}) },
    { emit: async () => {} },
  );

  await assert.rejects(
    service.emit({ mode: "group" }, context),
    BadRequestException,
  );
});
