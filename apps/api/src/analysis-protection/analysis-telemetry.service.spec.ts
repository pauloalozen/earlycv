import assert from "node:assert/strict";
import { test } from "node:test";

import { AnalysisTelemetryService } from "./analysis-telemetry.service";
import type { AnalysisRequestContext } from "./types";

const context: AnalysisRequestContext = {
  correlationId: "corr-1",
  ip: "203.0.113.10",
  requestId: "req-1",
  routePath: "/api/cv-adaptation/analyze",
  sessionInternalId: "session-1",
  sessionPublicToken: null,
  userAgentHash: "ua-1",
  userId: "user-1",
};

const posthogExporterStub = {
  exportProtectionEvent: () => {},
  shouldExportProtectionEvent: () => false,
};

test("creates telemetry event with scrubbed metadata and route key", async () => {
  let createPayload: Record<string, unknown> | null = null;

  const service = new AnalysisTelemetryService(
    {
      analysisProtectionEvent: {
        create: async (args: Record<string, unknown>) => {
          createPayload = args;
        },
        upsert: async () => {
          throw new Error("upsert should not be called");
        },
      },
      // biome-ignore lint/suspicious/noExplicitAny: test mock
    } as any,
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    posthogExporterStub as any,
  );

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
  assert.equal(
    (createPayload as { data: { eventVersion: number } }).data.eventVersion,
    1,
  );
  assert.deepEqual(
    (createPayload as { data: { metadataJson: Record<string, unknown> } }).data
      .metadataJson,
    { keep: "value" },
  );
});

test("uses idempotent upsert when idempotency key is provided", async () => {
  let upsertPayload: Record<string, unknown> | null = null;

  const service = new AnalysisTelemetryService(
    {
      analysisProtectionEvent: {
        create: async () => {
          throw new Error("create should not be called");
        },
        upsert: async (args: Record<string, unknown>) => {
          upsertPayload = args;
        },
      },
      // biome-ignore lint/suspicious/noExplicitAny: test mock
    } as any,
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    posthogExporterStub as any,
  );

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
  const service = new AnalysisTelemetryService(
    {
      analysisProtectionEvent: {
        create: async () => {
          throw new Error("database unavailable");
        },
        upsert: async () => {
          throw new Error("database unavailable");
        },
      },
      // biome-ignore lint/suspicious/noExplicitAny: test mock
    } as any,
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    posthogExporterStub as any,
  );

  await assert.doesNotReject(async () => {
    await service.emit("openai_request_failed", context, {
      metadata: { reason: "provider_timeout" },
    });
  });
});

test("redacts sessionPublicToken keys nested inside metadata objects", async () => {
  let createPayload: Record<string, unknown> | null = null;

  const service = new AnalysisTelemetryService(
    {
      analysisProtectionEvent: {
        create: async (args: Record<string, unknown>) => {
          createPayload = args;
        },
        upsert: async () => {
          throw new Error("upsert should not be called");
        },
      },
      // biome-ignore lint/suspicious/noExplicitAny: test mock
    } as any,
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    posthogExporterStub as any,
  );

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

test("removes prohibited personal/content fields from nested metadata", async () => {
  let createPayload: Record<string, unknown> | null = null;

  const service = new AnalysisTelemetryService(
    {
      analysisProtectionEvent: {
        create: async (args: Record<string, unknown>) => {
          createPayload = args;
        },
        upsert: async () => {
          throw new Error("upsert should not be called");
        },
      },
      // biome-ignore lint/suspicious/noExplicitAny: test mock
    } as any,
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    posthogExporterStub as any,
  );

  await service.emit("payload_valid", context, {
    metadata: {
      cv: "raw",
      nested: {
        email: "user@example.com",
        previewText: "secret",
        safe: 1,
      },
    },
  });

  const metadataJson =
    (createPayload as { data: { metadataJson: Record<string, unknown> } })?.data
      .metadataJson ?? {};
  assert.equal(metadataJson.cv, undefined);
  assert.equal(
    ((metadataJson.nested as Record<string, unknown>) ?? {}).email,
    undefined,
  );
  assert.equal(
    ((metadataJson.nested as Record<string, unknown>) ?? {}).previewText,
    undefined,
  );
  assert.equal(((metadataJson.nested as Record<string, unknown>) ?? {}).safe, 1);
});

test("throws controlled error when event is missing version registry entry", async () => {
  const service = new AnalysisTelemetryService(
    {
      analysisProtectionEvent: {
        create: async () => {
          throw new Error("create should not be called");
        },
        upsert: async () => {
          throw new Error("upsert should not be called");
        },
      },
      // biome-ignore lint/suspicious/noExplicitAny: test mock
    } as any,
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    posthogExporterStub as any,
  );

  await assert.rejects(
    service.emit(
      "missing_event_name" as unknown as Parameters<
        AnalysisTelemetryService["emit"]
      >[0],
      context,
    ),
    /Missing event version registry entry/i,
  );
});
