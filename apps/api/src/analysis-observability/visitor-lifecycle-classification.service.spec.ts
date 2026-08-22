import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { Test } from "@nestjs/testing";

import { DatabaseModule } from "../database/database.module";
import { PosthogIntegrationModule } from "../posthog-integration/posthog-integration.module";
import { AnalysisObservabilityModule } from "./analysis-observability.module";
import { BusinessFunnelEventService } from "./business-funnel-event.service";
import { VisitorLifecycleClassificationService } from "./visitor-lifecycle-classification.service";

function buildContext() {
  return {
    requestId: randomUUID(),
    correlationId: randomUUID(),
    sessionPublicToken: null,
    sessionInternalId: null,
    userId: null,
    ip: null,
    routePath: null,
    userAgentHash: null,
  };
}

async function recordEvent(
  service: BusinessFunnelEventService,
  input: {
    eventName: string;
    sessionInternalId: string;
    visitorId: string;
  },
) {
  await service.record(
    {
      eventName: input.eventName,
      eventVersion: 1,
      idempotencyKey: `${input.eventName}:${input.sessionInternalId}:${randomUUID()}`,
      metadata: {
        sessionInternalId: input.sessionInternalId,
        visitor_id: input.visitorId,
      },
      routeKey: "test",
    },
    buildContext(),
    "frontend",
  );
}

test("VisitorLifecycleClassificationService: first known session for a visitor_id classifies as new_visitor", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      PosthogIntegrationModule,
      AnalysisObservabilityModule,
    ],
  }).compile();

  const funnelEvents = moduleRef.get(BusinessFunnelEventService);
  const classifier = moduleRef.get(VisitorLifecycleClassificationService);
  const visitorId = randomUUID();
  const sessionInternalId = randomUUID();

  await recordEvent(funnelEvents, {
    eventName: "page_view",
    sessionInternalId,
    visitorId,
  });

  const classification = await classifier.classify(
    visitorId,
    sessionInternalId,
  );
  assert.equal(classification, "new_visitor");

  await moduleRef.close();
});

test("VisitorLifecycleClassificationService: same visitor_id with two different sessionInternalId — first is new_visitor, second is returning_visitor", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      PosthogIntegrationModule,
      AnalysisObservabilityModule,
    ],
  }).compile();

  const funnelEvents = moduleRef.get(BusinessFunnelEventService);
  const classifier = moduleRef.get(VisitorLifecycleClassificationService);
  const visitorId = randomUUID();
  const firstSession = randomUUID();
  const secondSession = randomUUID();

  await recordEvent(funnelEvents, {
    eventName: "page_view",
    sessionInternalId: firstSession,
    visitorId,
  });

  const firstClassification = await classifier.classify(
    visitorId,
    firstSession,
  );
  assert.equal(firstClassification, "new_visitor");

  // Espera garantida de ordenação temporal entre as duas sessões.
  await new Promise((resolve) => setTimeout(resolve, 10));

  await recordEvent(funnelEvents, {
    eventName: "page_view",
    sessionInternalId: secondSession,
    visitorId,
  });

  const secondClassification = await classifier.classify(
    visitorId,
    secondSession,
  );
  assert.equal(secondClassification, "returning_visitor");

  // O reclassificar a primeira sessão continua estável — não muda com o
  // tempo/eventos adicionados depois dela.
  const firstClassificationAgain = await classifier.classify(
    visitorId,
    firstSession,
  );
  assert.equal(firstClassificationAgain, "new_visitor");

  await moduleRef.close();
});

test("VisitorLifecycleClassificationService: different visitors never share lifecycle classification", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      PosthogIntegrationModule,
      AnalysisObservabilityModule,
    ],
  }).compile();

  const funnelEvents = moduleRef.get(BusinessFunnelEventService);
  const classifier = moduleRef.get(VisitorLifecycleClassificationService);
  const visitorA = randomUUID();
  const visitorB = randomUUID();
  const sessionA1 = randomUUID();
  const sessionB1 = randomUUID();

  await recordEvent(funnelEvents, {
    eventName: "page_view",
    sessionInternalId: sessionA1,
    visitorId: visitorA,
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await recordEvent(funnelEvents, {
    eventName: "page_view",
    sessionInternalId: sessionB1,
    visitorId: visitorB,
  });

  // visitorB só apareceu depois de visitorA no tempo, mas são visitantes
  // diferentes — a sessão de visitorB continua sendo o PRIMEIRO evento
  // conhecido para o próprio visitor_id dele, não "returning" em relação a
  // um visitante diferente.
  assert.equal(await classifier.classify(visitorA, sessionA1), "new_visitor");
  assert.equal(await classifier.classify(visitorB, sessionB1), "new_visitor");

  await moduleRef.close();
});

test("VisitorLifecycleClassificationService returns unknown for an unseen visitor_id", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      PosthogIntegrationModule,
      AnalysisObservabilityModule,
    ],
  }).compile();

  const classifier = moduleRef.get(VisitorLifecycleClassificationService);

  const classification = await classifier.classify(randomUUID(), randomUUID());
  assert.equal(classification, "unknown");

  await moduleRef.close();
});
