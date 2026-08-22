import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { Test } from "@nestjs/testing";

import { DatabaseModule } from "../database/database.module";
import { PosthogIntegrationModule } from "../posthog-integration/posthog-integration.module";
import { AnalysisObservabilityModule } from "./analysis-observability.module";
import { BusinessFunnelEventService } from "./business-funnel-event.service";
import { JourneySessionClassificationService } from "./journey-session-classification.service";

type FrontendEventInput = {
  eventName: string;
  sessionInternalId: string;
  isAuthenticated?: boolean;
  extraMetadata?: Record<string, unknown>;
};

function buildContext(overrides: { userId?: string | null } = {}) {
  return {
    requestId: randomUUID(),
    correlationId: randomUUID(),
    sessionPublicToken: null,
    sessionInternalId: null,
    userId: overrides.userId ?? null,
    ip: null,
    routePath: null,
    userAgentHash: null,
  };
}

async function recordFrontendEvent(
  service: BusinessFunnelEventService,
  input: FrontendEventInput,
) {
  // Espelha o formato real que getAnalyticsBaseProperties() manda pro
  // backend: sessionInternalId e isAuthenticated dentro de metadata, não
  // na coluna de contexto (ver docs/runbook/events.md seção 2).
  await service.record(
    {
      eventName: input.eventName,
      eventVersion: 1,
      metadata: {
        sessionInternalId: input.sessionInternalId,
        isAuthenticated: input.isAuthenticated ?? false,
        ...input.extraMetadata,
      },
      routeKey: "test",
    },
    buildContext(),
    "frontend",
  );
}

async function recordBackendEvent(
  service: BusinessFunnelEventService,
  input: FrontendEventInput,
) {
  await service.record(
    {
      eventName: input.eventName,
      eventVersion: 1,
      idempotencyKey: `${input.eventName}:${input.sessionInternalId}:${randomUUID()}`,
      metadata: {
        sessionInternalId: input.sessionInternalId,
        ...input.extraMetadata,
      },
      routeKey: "test",
    },
    buildContext(),
    "backend",
  );
}

test("JourneySessionClassificationService end-to-end: new visitor who signs up classifies as new_user_journey", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      PosthogIntegrationModule,
      AnalysisObservabilityModule,
    ],
  }).compile();

  const funnelEvents = moduleRef.get(BusinessFunnelEventService);
  const classifier = moduleRef.get(JourneySessionClassificationService);
  const sessionInternalId = `journey-${randomUUID()}`;

  await recordFrontendEvent(funnelEvents, {
    eventName: "page_view",
    sessionInternalId,
  });
  await recordFrontendEvent(funnelEvents, {
    eventName: "analyze_submit_clicked",
    sessionInternalId,
  });
  await recordBackendEvent(funnelEvents, {
    eventName: "signup_completed",
    sessionInternalId,
  });

  const classification = await classifier.classify(sessionInternalId);
  assert.equal(classification, "new_user_journey");

  await moduleRef.close();
});

test("JourneySessionClassificationService end-to-end: visitor who never converts classifies as anonymous_journey", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      PosthogIntegrationModule,
      AnalysisObservabilityModule,
    ],
  }).compile();

  const funnelEvents = moduleRef.get(BusinessFunnelEventService);
  const classifier = moduleRef.get(JourneySessionClassificationService);
  const sessionInternalId = `journey-${randomUUID()}`;

  await recordFrontendEvent(funnelEvents, {
    eventName: "page_view",
    sessionInternalId,
  });
  await recordFrontendEvent(funnelEvents, {
    eventName: "job_description_filled",
    sessionInternalId,
  });

  const classification = await classifier.classify(sessionInternalId);
  assert.equal(classification, "anonymous_journey");

  await moduleRef.close();
});

test("JourneySessionClassificationService end-to-end: session that starts already authenticated classifies as existing_user_journey", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      PosthogIntegrationModule,
      AnalysisObservabilityModule,
    ],
  }).compile();

  const funnelEvents = moduleRef.get(BusinessFunnelEventService);
  const classifier = moduleRef.get(JourneySessionClassificationService);
  const sessionInternalId = `journey-${randomUUID()}`;

  await recordFrontendEvent(funnelEvents, {
    eventName: "dashboard_viewed",
    sessionInternalId,
    isAuthenticated: true,
  });

  const classification = await classifier.classify(sessionInternalId);
  assert.equal(classification, "existing_user_journey");

  await moduleRef.close();
});

test("JourneySessionClassificationService end-to-end: existing user who starts anonymous and logs in mid-session classifies the whole journey as existing_user_journey", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      PosthogIntegrationModule,
      AnalysisObservabilityModule,
    ],
  }).compile();

  const funnelEvents = moduleRef.get(BusinessFunnelEventService);
  const classifier = moduleRef.get(JourneySessionClassificationService);
  const sessionInternalId = `journey-${randomUUID()}`;

  await recordFrontendEvent(funnelEvents, {
    eventName: "page_view",
    sessionInternalId,
  });
  await recordFrontendEvent(funnelEvents, {
    eventName: "landing_cta_click",
    sessionInternalId,
  });
  await recordBackendEvent(funnelEvents, {
    eventName: "login_completed",
    sessionInternalId,
  });
  await recordFrontendEvent(funnelEvents, {
    eventName: "dashboard_viewed",
    sessionInternalId,
    isAuthenticated: true,
  });

  const classification = await classifier.classify(sessionInternalId);
  assert.equal(classification, "existing_user_journey");

  await moduleRef.close();
});

test("JourneySessionClassificationService end-to-end: Radar entry from a new visitor who signs up classifies as new_user_journey", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      PosthogIntegrationModule,
      AnalysisObservabilityModule,
    ],
  }).compile();

  const funnelEvents = moduleRef.get(BusinessFunnelEventService);
  const classifier = moduleRef.get(JourneySessionClassificationService);
  const sessionInternalId = `journey-${randomUUID()}`;

  await recordFrontendEvent(funnelEvents, {
    eventName: "radar_view",
    sessionInternalId,
  });
  await recordBackendEvent(funnelEvents, {
    eventName: "signup_completed",
    sessionInternalId,
    extraMetadata: { conversion_context: "radar" },
  });

  const classification = await classifier.classify(sessionInternalId);
  assert.equal(classification, "new_user_journey");

  await moduleRef.close();
});

test("JourneySessionClassificationService end-to-end: Radar entry from an existing user who logs in classifies as existing_user_journey", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      PosthogIntegrationModule,
      AnalysisObservabilityModule,
    ],
  }).compile();

  const funnelEvents = moduleRef.get(BusinessFunnelEventService);
  const classifier = moduleRef.get(JourneySessionClassificationService);
  const sessionInternalId = `journey-${randomUUID()}`;

  await recordFrontendEvent(funnelEvents, {
    eventName: "radar_view",
    sessionInternalId,
  });
  await recordBackendEvent(funnelEvents, {
    eventName: "login_completed",
    sessionInternalId,
  });

  const classification = await classifier.classify(sessionInternalId);
  assert.equal(classification, "existing_user_journey");

  await moduleRef.close();
});

test("JourneySessionClassificationService returns unknown for an unseen sessionInternalId", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      PosthogIntegrationModule,
      AnalysisObservabilityModule,
    ],
  }).compile();

  const classifier = moduleRef.get(JourneySessionClassificationService);

  const classification = await classifier.classify(`journey-${randomUUID()}`);
  assert.equal(classification, "unknown");

  await moduleRef.close();
});
