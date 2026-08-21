import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { GUARDS_METADATA } from "@nestjs/common/constants";
import type { AnalysisRequestContext } from "../analysis-protection/types";
import { INTERNAL_ROLES_KEY } from "../common/roles.decorator";
import { AdminEventsController } from "./admin-events.controller";
import type {
  AdminEventsCatalog,
  AdminEventsEmitSummary,
} from "./admin-events-emitter.service";
import type { EmitAdminEventsDto } from "./dto/emit-admin-events.dto";
import type { JourneySessionClassification } from "./journey-session-classification";
import type { JourneySessionClassificationService } from "./journey-session-classification.service";

type AdminEventsEmitterServiceStub = {
  buildCatalog: () => AdminEventsCatalog;
  emit: (
    payload: EmitAdminEventsDto,
    context: AnalysisRequestContext,
  ) => Promise<AdminEventsEmitSummary>;
};

const noopJourneyClassifier = {
  classify: async () => "unknown" as JourneySessionClassification,
} satisfies Pick<JourneySessionClassificationService, "classify">;

test("admin events controller enforces admin/superadmin guards", () => {
  const guards =
    Reflect.getMetadata(GUARDS_METADATA, AdminEventsController) ?? [];
  const roles =
    Reflect.getMetadata(INTERNAL_ROLES_KEY, AdminEventsController) ?? [];

  assert.equal(Array.isArray(guards), true);
  assert.equal(guards.length >= 2, true);
  assert.deepEqual(roles, ["admin", "superadmin"]);
});

test("catalog returns protection and business arrays", async () => {
  const controller = new AdminEventsController(
    {
      buildCatalog: () => ({
        protection: [{ eventName: "payload_valid", eventVersion: 1 }],
        business: [{ eventName: "page_view", eventVersion: 1 }],
      }),
      emit: async () => {
        throw new Error("not called");
      },
    } satisfies AdminEventsEmitterServiceStub as AdminEventsEmitterServiceStub,
    noopJourneyClassifier as JourneySessionClassificationService,
  );

  const response = await controller.catalog();

  assert.equal(Array.isArray(response.protection), true);
  assert.equal(Array.isArray(response.business), true);
  assert.equal(response.protection[0]?.eventName, "payload_valid");
  assert.equal(response.business[0]?.eventName, "page_view");
});

test("emit forwards payload and context", async () => {
  let call: {
    payload: EmitAdminEventsDto;
    context: AnalysisRequestContext;
  } | null = null;

  const controller = new AdminEventsController(
    {
      buildCatalog: () => ({ protection: [], business: [] }),
      emit: async (payload, context) => {
        call = { payload, context };

        return {
          requested: 1,
          sent: 1,
          failed: 0,
          results: [
            { domain: "business", eventName: "page_view", status: "sent" },
          ],
        };
      },
    } satisfies AdminEventsEmitterServiceStub as AdminEventsEmitterServiceStub,
    noopJourneyClassifier as JourneySessionClassificationService,
  );

  const req = {
    analysisContext: {
      requestId: "req-1",
      correlationId: "corr-1",
      sessionPublicToken: null,
      sessionInternalId: "session-1",
      userId: "user-1",
      ip: "203.0.113.10",
      routePath: "/admin/analysis-observability/events/emit",
      userAgentHash: "ua-1",
    },
  } as { analysisContext: AnalysisRequestContext };
  const payload: EmitAdminEventsDto = {
    mode: "group",
    group: "business",
  };

  const response = await controller.emit(req, payload);

  assert.deepEqual(call, {
    payload,
    context: req.analysisContext,
  });
  assert.equal(response.requested, 1);
  assert.equal(response.sent, 1);
  assert.equal(response.failed, 0);
});

test("journeyClassification forwards sessionInternalId to the classifier and returns its result", async () => {
  let receivedSessionInternalId: string | null = null;

  const controller = new AdminEventsController(
    {
      buildCatalog: () => ({ protection: [], business: [] }),
      emit: async () => {
        throw new Error("not called");
      },
    } satisfies AdminEventsEmitterServiceStub as AdminEventsEmitterServiceStub,
    {
      classify: async (sessionInternalId: string) => {
        receivedSessionInternalId = sessionInternalId;
        return "new_user_journey" as JourneySessionClassification;
      },
    } as JourneySessionClassificationService,
  );

  const response = await controller.journeyClassification("journey-abc-123");

  assert.equal(receivedSessionInternalId, "journey-abc-123");
  assert.deepEqual(response, {
    sessionInternalId: "journey-abc-123",
    classification: "new_user_journey",
  });
});

test("journeyClassification rejects an empty sessionInternalId", async () => {
  const controller = new AdminEventsController(
    {
      buildCatalog: () => ({ protection: [], business: [] }),
      emit: async () => {
        throw new Error("not called");
      },
    } satisfies AdminEventsEmitterServiceStub as AdminEventsEmitterServiceStub,
    noopJourneyClassifier as JourneySessionClassificationService,
  );

  await assert.rejects(controller.journeyClassification("   "));
});
