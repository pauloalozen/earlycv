import assert from "node:assert/strict";
import { test } from "node:test";

import { AnalysisTelemetryService } from "./analysis-telemetry.service";
import type { AnalysisRequestContext } from "./types";

const context: AnalysisRequestContext = {
  correlationId: "corr-1",
  ip: "203.0.113.10",
  requestId: "req-1",
  sessionInternalId: "session-1",
  sessionPublicToken: null,
  userId: "user-1",
};

test("creates telemetry event with scrubbed metadata and route key", async () => {
  let createPayload: Record<string, unknown> | null = null;

  const service = new AnalysisTelemetryService({
    analysisProtectionEvent: {
      create: async (args: Record<string, unknown>) => {
        createPayload = args;
      },
      upsert: async () => {
        throw new Error("upsert should not be called");
      },
    },
  } as any);

  await service.emit("payload_valid", context, {
    metadata: {
      keep: "value",
      sessionPublicToken: "must-not-persist",
    },
    routeKey: "analysis/score-resume",
  });

  assert.ok(createPayload);
  assert.equal(
    (createPayload as { data: { routeKey: string } }).data.routeKey,
    "analysis/score-resume",
  );
  assert.deepEqual(
    (createPayload as { data: { metadataJson: Record<string, unknown> } }).data
      .metadataJson,
    { keep: "value" },
  );
});

test("uses idempotent upsert when idempotency key is provided", async () => {
  let upsertPayload: Record<string, unknown> | null = null;

  const service = new AnalysisTelemetryService({
    analysisProtectionEvent: {
      create: async () => {
        throw new Error("create should not be called");
      },
      upsert: async (args: Record<string, unknown>) => {
        upsertPayload = args;
      },
    },
  } as any);

  await service.emit("cache_miss", context, {
    idempotencyKey: "idem-1",
    metadata: { value: 1 },
  });

  assert.ok(upsertPayload);
  assert.equal(
    (
      upsertPayload as {
        where: { idempotencyKey: string };
      }
    ).where.idempotencyKey,
    "idem-1",
  );
});

test("swallows persistence errors and does not throw", async () => {
  const service = new AnalysisTelemetryService({
    analysisProtectionEvent: {
      create: async () => {
        throw new Error("database unavailable");
      },
      upsert: async () => {
        throw new Error("database unavailable");
      },
    },
  } as any);

  await assert.doesNotReject(async () => {
    await service.emit("openai_request_failed", context, {
      metadata: { reason: "provider_timeout" },
    });
  });
});

test("redacts sessionPublicToken keys nested inside metadata objects", async () => {
  let createPayload: Record<string, unknown> | null = null;

  const service = new AnalysisTelemetryService({
    analysisProtectionEvent: {
      create: async (args: Record<string, unknown>) => {
        createPayload = args;
      },
      upsert: async () => {
        throw new Error("upsert should not be called");
      },
    },
  } as any);

  await service.emit("payload_valid", context, {
    metadata: {
      keep: "value",
      nested: {
        another: {
          sessionPublicToken: "must-not-persist",
          stillHere: "yes",
        },
      },
      list: [
        { id: 1, sessionPublicToken: "token-1" },
        { id: 2, child: { sessionPublicToken: "token-2", keep: true } },
      ],
    },
  });

  assert.ok(createPayload);
  assert.deepEqual(
    (createPayload as { data: { metadataJson: Record<string, unknown> } }).data
      .metadataJson,
    {
      keep: "value",
      nested: {
        another: {
          stillHere: "yes",
        },
      },
      list: [{ id: 1 }, { id: 2, child: { keep: true } }],
    },
  );
});
