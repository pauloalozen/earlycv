import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";

import { BusinessFunnelEventService } from "./business-funnel-event.service";
import { BusinessFunnelProjectionService } from "./business-funnel-projection.service";

type StoredBusinessFunnelEvent = {
  correlationId: string;
  createdAt: Date;
  eventName: string;
  eventVersion: number;
  id: string;
  idempotencyKey: string | null;
  metadataJson: Record<string, unknown> | null;
  requestId: string;
  routeKey: string | null;
  sessionInternalId: string | null;
  userId: string | null;
};

const baseContext = {
  correlationId: "corr-1",
  ip: "203.0.113.10",
  requestId: "req-1",
  routePath: "/api/cv-adaptation/analyze",
  posthogSessionId: "ph-session-1",
  sessionInternalId: "session-1",
  sessionPublicToken: null,
  userAgentHash: "ua-1",
  userId: "user-1",
};

test("records business event and updates projection for first ingestion", async () => {
  const storedByKey = new Map<string, StoredBusinessFunnelEvent>();
  const projectionApplied: string[] = [];

  const service = new BusinessFunnelEventService(
    {
      businessFunnelEvent: {
        findUnique: async ({
          where,
        }: {
          where: { idempotencyKey: string };
        }) => {
          return storedByKey.get(where.idempotencyKey) ?? null;
        },
      },
      $transaction: async (
        callback: (tx: {
          businessFunnelEvent: {
            createMany: (args: {
              data: Record<string, unknown>[];
              skipDuplicates?: boolean;
            }) => Promise<{ count: number }>;
            findUnique: (args: {
              where: { idempotencyKey: string };
            }) => Promise<StoredBusinessFunnelEvent | null>;
          };
        }) => Promise<unknown>,
      ) => {
        return callback({
          businessFunnelEvent: {
            createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
              const record = data[0];
              const event = {
                id: `event-${storedByKey.size + 1}`,
                createdAt: new Date("2026-04-21T15:30:00.000Z"),
                ...record,
              } as StoredBusinessFunnelEvent;

              if (typeof event.idempotencyKey === "string") {
                storedByKey.set(event.idempotencyKey, event);
              }

              return { count: 1 };
            },
            findUnique: async ({
              where,
            }: {
              where: { idempotencyKey: string };
            }) => {
              return storedByKey.get(where.idempotencyKey) ?? null;
            },
          },
        });
      },
    } as any,
    {
      applyEvent: async (
        event: Pick<StoredBusinessFunnelEvent, "eventName">,
      ) => {
        projectionApplied.push(event.eventName);
      },
    } as BusinessFunnelProjectionService,
  );

  const ingested = await service.record(
    {
      eventName: "analyze_submit_clicked",
      eventVersion: 1,
      idempotencyKey: "evt-123",
      metadata: { page: "adaptar" },
      routeKey: "web/adaptar",
    },
    baseContext,
  );

  assert.equal(ingested.ingested, true);
  assert.equal(ingested.event.eventName, "analyze_submit_clicked");
  assert.equal(ingested.event.eventVersion, 1);
  assert.equal(ingested.event.correlationId, "corr-1");
  assert.deepEqual(projectionApplied, ["analyze_submit_clicked"]);
});

test("falls back to null userId when persistence hits user foreign key violation", async () => {
  const storedByKey = new Map<string, StoredBusinessFunnelEvent>();
  const projectionApplied: string[] = [];
  let createManyAttempts = 0;

  const service = new BusinessFunnelEventService(
    {
      $transaction: async (
        callback: (tx: {
          businessFunnelEvent: {
            createMany: (args: {
              data: Record<string, unknown>[];
              skipDuplicates?: boolean;
            }) => Promise<{ count: number }>;
            findUnique: (args: {
              where: { idempotencyKey: string };
            }) => Promise<StoredBusinessFunnelEvent | null>;
          };
        }) => Promise<unknown>,
      ) => {
        return callback({
          businessFunnelEvent: {
            createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
              createManyAttempts += 1;
              const record = data[0];

              if (createManyAttempts === 1) {
                const error = new Error("fk violation") as Error & {
                  code: string;
                  meta: { constraint: string };
                };
                error.code = "P2003";
                error.meta = { constraint: "BusinessFunnelEvent_userId_fkey" };
                throw error;
              }

              const event = {
                id: `event-${storedByKey.size + 1}`,
                createdAt: new Date("2026-04-21T15:30:00.000Z"),
                ...record,
              } as StoredBusinessFunnelEvent;

              if (typeof event.idempotencyKey === "string") {
                storedByKey.set(event.idempotencyKey, event);
              }

              return { count: 1 };
            },
            findUnique: async ({
              where,
            }: {
              where: { idempotencyKey: string };
            }) => {
              return storedByKey.get(where.idempotencyKey) ?? null;
            },
          },
        });
      },
    } as any,
    {
      applyEvent: async (
        event: Pick<StoredBusinessFunnelEvent, "eventName">,
      ) => {
        projectionApplied.push(event.eventName);
      },
    } as BusinessFunnelProjectionService,
  );

  const ingested = await service.record(
    {
      eventName: "analyze_submit_clicked",
      eventVersion: 1,
      idempotencyKey: "evt-fk-1",
    },
    baseContext,
  );

  assert.equal(ingested.ingested, true);
  assert.equal(ingested.event.userId, null);
  assert.equal(createManyAttempts, 2);
  assert.deepEqual(projectionApplied, ["analyze_submit_clicked"]);
});

test("exports event to PostHog when ingestion succeeds", async () => {
  const exported: Array<{
    eventName: string;
    properties: Record<string, unknown>;
    source: string;
  }> = [];

  const service = new BusinessFunnelEventService(
    {
      $transaction: async (
        callback: (tx: {
          businessFunnelEvent: {
            create: (args: {
              data: Record<string, unknown>;
            }) => Promise<StoredBusinessFunnelEvent>;
            findUnique: (args: {
              where: { idempotencyKey: string };
            }) => Promise<StoredBusinessFunnelEvent | null>;
          };
        }) => Promise<unknown>,
      ) => {
        return callback({
          businessFunnelEvent: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              return {
                id: "event-1",
                createdAt: new Date("2026-04-21T15:30:00.000Z"),
                ...data,
              } as StoredBusinessFunnelEvent;
            },
            findUnique: async () => null,
          },
        });
      },
    } as any,
    {
      applyEvent: async () => {},
    } as BusinessFunnelProjectionService,
    {
      exportBusinessFunnelEvent: (
        eventName: string,
        properties: Record<string, unknown>,
        source: string,
      ) => {
        exported.push({ eventName, properties, source });
      },
      shouldExportBusinessFunnelEvent: () => true,
    } as any,
  );

  await service.record(
    {
      eventName: "analyze_submit_clicked",
      eventVersion: 1,
      metadata: { page: "adaptar" },
      routeKey: "web/adaptar",
    },
    baseContext,
    "frontend",
  );

  assert.equal(exported.length, 1);
  assert.equal(exported[0].eventName, "analyze_submit_clicked");
  assert.equal(exported[0].source, "frontend");
  assert.equal(exported[0].properties.request_id, baseContext.requestId);
  assert.equal(exported[0].properties.$session_id, "ph-session-1");
  assert.equal(exported[0].properties.sessionInternalId, "session-1");
});

test("keeps context $session_id when metadata sends null", async () => {
  const exported: Array<{ properties: Record<string, unknown> }> = [];

  const service = new BusinessFunnelEventService(
    {
      $transaction: async (
        callback: (tx: {
          businessFunnelEvent: {
            create: (args: {
              data: Record<string, unknown>;
            }) => Promise<StoredBusinessFunnelEvent>;
            findUnique: (args: {
              where: { idempotencyKey: string };
            }) => Promise<StoredBusinessFunnelEvent | null>;
          };
        }) => Promise<unknown>,
      ) => {
        return callback({
          businessFunnelEvent: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              return {
                id: "event-2",
                createdAt: new Date("2026-04-21T15:30:00.000Z"),
                ...data,
              } as StoredBusinessFunnelEvent;
            },
            findUnique: async () => null,
          },
        });
      },
    } as any,
    {
      applyEvent: async () => {},
    } as BusinessFunnelProjectionService,
    {
      exportBusinessFunnelEvent: (
        _eventName: string,
        properties: Record<string, unknown>,
      ) => {
        exported.push({ properties });
      },
      shouldExportBusinessFunnelEvent: () => true,
    } as any,
  );

  await service.record(
    {
      eventName: "session_started",
      eventVersion: 1,
      metadata: {
        $session_id: null,
      },
    },
    baseContext,
    "frontend",
  );

  assert.equal(exported.length, 1);
  assert.equal(exported[0].properties.$session_id, "ph-session-1");
});

test("canonicalizes eventName before persisting and projecting", async () => {
  let persistedEventName: string | null = null;
  const projectionApplied: string[] = [];

  const service = new BusinessFunnelEventService(
    {
      businessFunnelEvent: {
        findUnique: async () => createdEvent,
      },
      $transaction: async (
        callback: (tx: {
          businessFunnelEvent: {
            create: (args: {
              data: Record<string, unknown>;
            }) => Promise<StoredBusinessFunnelEvent>;
            findUnique: (args: {
              where: { idempotencyKey: string };
            }) => Promise<StoredBusinessFunnelEvent | null>;
          };
        }) => Promise<unknown>,
      ) => {
        return callback({
          businessFunnelEvent: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const event = {
                id: "event-1",
                createdAt: new Date("2026-04-21T15:30:00.000Z"),
                ...data,
              } as StoredBusinessFunnelEvent;

              persistedEventName = event.eventName;
              return event;
            },
            findUnique: async () => null,
          },
        });
      },
    } as any,
    {
      applyEvent: async (
        event: Pick<StoredBusinessFunnelEvent, "eventName">,
      ) => {
        projectionApplied.push(event.eventName);
      },
    } as BusinessFunnelProjectionService,
  );

  await service.record(
    {
      eventName: "  Analyze_Submit_Clicked  ",
      eventVersion: 1,
    },
    baseContext,
  );

  assert.equal(persistedEventName, "analyze_submit_clicked");
  assert.deepEqual(projectionApplied, ["analyze_submit_clicked"]);
});

test("drops duplicate business event by idempotency key", async () => {
  const storedByKey = new Map<string, StoredBusinessFunnelEvent>();
  const projectionApplied: string[] = [];
  let createManyAttempts = 0;

  const service = new BusinessFunnelEventService(
    {
      $transaction: async (
        callback: (tx: {
          businessFunnelEvent: {
            createMany: (args: {
              data: Record<string, unknown>[];
              skipDuplicates?: boolean;
            }) => Promise<{ count: number }>;
            findUnique: (args: {
              where: { idempotencyKey: string };
            }) => Promise<StoredBusinessFunnelEvent | null>;
          };
        }) => Promise<unknown>,
      ) => {
        return callback({
          businessFunnelEvent: {
            createMany: async ({ data, skipDuplicates }: { data: Record<string, unknown>[]; skipDuplicates?: boolean }) => {
              createManyAttempts += 1;
              const record = data[0];

              if (skipDuplicates && typeof record.idempotencyKey === "string" && storedByKey.has(record.idempotencyKey)) {
                return { count: 0 };
              }

              const event = {
                id: `event-${storedByKey.size + 1}`,
                createdAt: new Date("2026-04-21T15:30:00.000Z"),
                ...record,
              } as StoredBusinessFunnelEvent;

              if (typeof event.idempotencyKey === "string") {
                storedByKey.set(event.idempotencyKey, event);
              }

              return { count: 1 };
            },
            findUnique: async ({
              where,
            }: {
              where: { idempotencyKey: string };
            }) => {
              return storedByKey.get(where.idempotencyKey) ?? null;
            },
          },
        });
      },
    } as any,
    {
      applyEvent: async (
        event: Pick<StoredBusinessFunnelEvent, "eventName">,
      ) => {
        projectionApplied.push(event.eventName);
      },
    } as BusinessFunnelProjectionService,
  );

  const payload = {
    eventName: "analyze_submit_clicked",
    eventVersion: 1,
    idempotencyKey: "evt-123",
  };

  await service.record(payload, baseContext);
  const duplicate = await service.record(payload, baseContext);

  assert.equal(duplicate.ingested, false);
  assert.equal(createManyAttempts, 2);
  assert.equal(storedByKey.size, 1);
  assert.deepEqual(projectionApplied, ["analyze_submit_clicked"]);
});

test("deduplicates concurrent idempotent ingestions without race", async () => {
  const projectionApplied: string[] = [];
  const storedByKey = new Map<string, StoredBusinessFunnelEvent>();
  let createManyAttempts = 0;

  const service = new BusinessFunnelEventService(
    {
      $transaction: async (
        callback: (tx: {
          businessFunnelEvent: {
            createMany: (args: {
              data: Record<string, unknown>[];
              skipDuplicates?: boolean;
            }) => Promise<{ count: number }>;
            findUnique: (args: {
              where: { idempotencyKey: string };
            }) => Promise<StoredBusinessFunnelEvent | null>;
          };
        }) => Promise<{
          event: StoredBusinessFunnelEvent;
          ingested: boolean;
        }>,
      ) => {
        return callback({
          businessFunnelEvent: {
            createMany: async ({ data, skipDuplicates }: { data: Record<string, unknown>[]; skipDuplicates?: boolean }) => {
              createManyAttempts += 1;
              const record = data[0];

              if (skipDuplicates && typeof record.idempotencyKey === "string" && storedByKey.has(record.idempotencyKey)) {
                return { count: 0 };
              }

              const event = {
                id: `event-${storedByKey.size + 1}`,
                createdAt: new Date("2026-04-21T15:30:00.000Z"),
                ...record,
              } as StoredBusinessFunnelEvent;

              if (typeof event.idempotencyKey === "string") {
                storedByKey.set(event.idempotencyKey, event);
              }

              return { count: 1 };
            },
            findUnique: async ({
              where,
            }: {
              where: { idempotencyKey: string };
            }) => {
              return storedByKey.get(where.idempotencyKey) ?? null;
            },
          },
        });
      },
    } as any,
    {
      applyEvent: async (
        event: Pick<StoredBusinessFunnelEvent, "eventName">,
      ) => {
        projectionApplied.push(event.eventName);
      },
    } as BusinessFunnelProjectionService,
  );

  const payload = {
    eventName: "analyze_submit_clicked",
    eventVersion: 1,
    idempotencyKey: "evt-123",
  };

  const firstResult = await service.record(payload, baseContext);
  const secondResult = await service.record(payload, baseContext);

  assert.equal(firstResult.ingested, true);
  assert.equal(secondResult.ingested, false);
  assert.equal(createManyAttempts, 2);
  assert.deepEqual(projectionApplied, ["analyze_submit_clicked"]);
});

test("throws if findUnique returns null after createMany skip", async () => {
  const service = new BusinessFunnelEventService(
    {
      $transaction: async (
        callback: (tx: {
          businessFunnelEvent: {
            createMany: (args: {
              data: Record<string, unknown>[];
              skipDuplicates?: boolean;
            }) => Promise<{ count: number }>;
            findUnique: (args: {
              where: { idempotencyKey: string };
            }) => Promise<StoredBusinessFunnelEvent | null>;
          };
        }) => Promise<unknown>,
      ) => {
        return callback({
          businessFunnelEvent: {
            createMany: async () => ({ count: 0 }),
            findUnique: async () => null,
          },
        });
      },
    } as any,
    {
      applyEvent: async () => {},
    } as BusinessFunnelProjectionService,
  );

  await assert.rejects(
    service.record(
      {
        eventName: "analyze_submit_clicked",
        eventVersion: 1,
        idempotencyKey: "evt-123",
      },
      baseContext,
    ),
    /Event not found after createMany/i,
  );
});

test("rolls back event write when projection application fails", async () => {
  const committedEvents: StoredBusinessFunnelEvent[] = [];

  const service = new BusinessFunnelEventService(
    {
      $transaction: async (
        callback: (tx: {
          businessFunnelEvent: {
            create: (args: {
              data: Record<string, unknown>;
            }) => Promise<StoredBusinessFunnelEvent>;
            findUnique: (args: {
              where: { idempotencyKey: string };
            }) => Promise<StoredBusinessFunnelEvent | null>;
          };
        }) => Promise<unknown>,
      ) => {
        const stagedEvents: StoredBusinessFunnelEvent[] = [];
        const tx = {
          businessFunnelEvent: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const event = {
                id: `event-${stagedEvents.length + 1}`,
                createdAt: new Date("2026-04-21T15:30:00.000Z"),
                ...data,
              } as StoredBusinessFunnelEvent;

              stagedEvents.push(event);
              return event;
            },
            findUnique: async () => null,
          },
        };

        const result = await callback(tx);
        committedEvents.push(...stagedEvents);
        return result;
      },
    } as any,
    {
      applyEvent: async () => {
        throw new Error("projection unavailable");
      },
    } as BusinessFunnelProjectionService,
  );

  await assert.rejects(
    service.record(
      {
        eventName: "analyze_submit_clicked",
        eventVersion: 1,
      },
      baseContext,
    ),
    /projection unavailable/i,
  );

  assert.equal(committedEvents.length, 0);
});

test("rejects protection decision semantic event names", async () => {
  const service = new BusinessFunnelEventService(
    {
      $transaction: async () => {
        throw new Error("transaction should not be called");
      },
    } as any,
    {
      applyEvent: async () => {
        throw new Error("projection should not be called");
      },
    } as BusinessFunnelProjectionService,
  );

  await assert.rejects(
    service.record(
      {
        eventName: "turnstile_invalid",
        eventVersion: 1,
      },
      baseContext,
    ),
    /business funnel event name is reserved for protection semantics/i,
  );
});

test("rejects case-variant reserved event names after normalization", async () => {
  const service = new BusinessFunnelEventService(
    {
      $transaction: async () => {
        throw new Error("transaction should not be called");
      },
    } as any,
    {
      applyEvent: async () => {
        throw new Error("projection should not be called");
      },
    } as BusinessFunnelProjectionService,
  );

  await assert.rejects(
    service.record(
      {
        eventName: "TuRnStIlE_invalid",
        eventVersion: 1,
      },
      baseContext,
    ),
    /business funnel event name is reserved for protection semantics/i,
  );
});

test("rejects missing eventName with bad request exception", async () => {
  const service = new BusinessFunnelEventService(
    {
      $transaction: async () => {
        throw new Error("transaction should not be called");
      },
    } as any,
    {
      applyEvent: async () => {
        throw new Error("projection should not be called");
      },
    } as BusinessFunnelProjectionService,
  );

  await assert.rejects(
    service.record(
      {
        eventVersion: 1,
      } as any,
      baseContext,
    ),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match(
        (error as BadRequestException).message,
        /eventName is required/i,
      );
      return true;
    },
  );
});

test("uses canonical context correlation and request IDs over payload", async () => {
  let capturedEvent: StoredBusinessFunnelEvent | null = null;

  const service = new BusinessFunnelEventService(
    {
      $transaction: async (
        callback: (tx: {
          businessFunnelEvent: {
            create: (args: {
              data: Record<string, unknown>;
            }) => Promise<StoredBusinessFunnelEvent>;
            findUnique: (args: {
              where: { idempotencyKey: string };
            }) => Promise<StoredBusinessFunnelEvent | null>;
          };
        }) => Promise<unknown>,
      ) => {
        return callback({
          businessFunnelEvent: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              capturedEvent = {
                id: "event-1",
                createdAt: new Date("2026-04-21T15:30:00.000Z"),
                ...data,
              } as StoredBusinessFunnelEvent;

              return capturedEvent;
            },
            findUnique: async () => null,
          },
        });
      },
    } as any,
    {
      applyEvent: async () => {},
    } as BusinessFunnelProjectionService,
  );

  await service.record(
    {
      correlationId: "payload-corr",
      eventName: "analyze_submit_clicked",
      eventVersion: 1,
      requestId: "payload-req",
    },
    baseContext,
  );

  assert.ok(capturedEvent);
  const persistedEvent = capturedEvent as StoredBusinessFunnelEvent;
  assert.equal(persistedEvent.correlationId, baseContext.correlationId);
  assert.equal(persistedEvent.requestId, baseContext.requestId);
});

test("projection updates counters based on stage and outcome", async () => {
  let upsertPayload: Record<string, unknown> | null = null;

  const projection = new BusinessFunnelProjectionService({
    businessFunnelStageMetric: {
      upsert: async (args: Record<string, unknown>) => {
        upsertPayload = args;
      },
    },
  } as any);

  await projection.applyEvent({
    correlationId: "corr-1",
    createdAt: new Date("2026-04-21T15:30:00.000Z"),
    eventName: "analysis_completed",
    eventVersion: 1,
    id: "evt-1",
    idempotencyKey: "evt-1",
    metadataJson: { outcome: "success" },
    requestId: "req-1",
    routeKey: null,
    sessionInternalId: null,
    userId: null,
  });

  assert.ok(upsertPayload);
  assert.equal(
    (upsertPayload as { where: { stageKey_metricDate: { stageKey: string } } })
      .where.stageKey_metricDate.stageKey,
    "analysis_completed",
  );
  assert.equal(
    (upsertPayload as { update: { totalCount: { increment: number } } }).update
      .totalCount.increment,
    1,
  );
  assert.equal(
    (upsertPayload as { update: { successCount: { increment: number } } })
      .update.successCount.increment,
    1,
  );
  assert.equal(
    (upsertPayload as { update: { errorCount: { increment: number } } }).update
      .errorCount.increment,
    0,
  );
});

test("rejects business funnel event missing version registry entry", async () => {
  const service = new BusinessFunnelEventService(
    {
      $transaction: async () => {
        throw new Error("transaction should not be called");
      },
    } as any,
    {
      applyEvent: async () => {
        throw new Error("projection should not be called");
      },
    } as BusinessFunnelProjectionService,
  );

  await assert.rejects(
    service.record(
      {
        eventName: "unknown_event_for_registry",
        eventVersion: 1,
      },
      baseContext,
      "frontend",
    ),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match(
        (error as BadRequestException).message,
        /event version registry/i,
      );
      return true;
    },
  );
});

test("rejects eventVersion mismatch against registry", async () => {
  const service = new BusinessFunnelEventService(
    {
      $transaction: async () => {
        throw new Error("transaction should not be called");
      },
    } as any,
    {
      applyEvent: async () => {
        throw new Error("projection should not be called");
      },
    } as BusinessFunnelProjectionService,
  );

  await assert.rejects(
    service.record(
      {
        eventName: "analyze_submit_clicked",
        eventVersion: 2,
      },
      baseContext,
      "frontend",
    ),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match((error as BadRequestException).message, /eventVersion/i);
      return true;
    },
  );
});

test("rejects frontend emission of backend-owned funnel events", async () => {
  const service = new BusinessFunnelEventService(
    {
      $transaction: async () => {
        throw new Error("transaction should not be called");
      },
    } as any,
    {
      applyEvent: async () => {
        throw new Error("projection should not be called");
      },
    } as BusinessFunnelProjectionService,
  );

  await assert.rejects(
    service.record(
      {
        eventName: "full_analysis_viewed",
        eventVersion: 1,
      },
      baseContext,
      "frontend",
    ),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match((error as BadRequestException).message, /ownership/i);
      return true;
    },
  );
});

test("accepts frontend page_view event from journey tracking", async () => {
  const storedByKey = new Map<string, StoredBusinessFunnelEvent>();

  const service = new BusinessFunnelEventService(
    {
      $transaction: async (
        callback: (tx: {
          businessFunnelEvent: {
            createMany: (args: {
              data: Record<string, unknown>[];
              skipDuplicates?: boolean;
            }) => Promise<{ count: number }>;
            findUnique: (args: {
              where: { idempotencyKey: string };
            }) => Promise<StoredBusinessFunnelEvent | null>;
          };
        }) => Promise<unknown>,
      ) => {
        return callback({
          businessFunnelEvent: {
            createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
              const record = data[0];
              const event = {
                id: "event-page-view",
                createdAt: new Date("2026-04-22T12:00:00.000Z"),
                ...record,
              } as StoredBusinessFunnelEvent;

              if (typeof event.idempotencyKey === "string") {
                storedByKey.set(event.idempotencyKey, event);
              }

              return { count: 1 };
            },
            findUnique: async ({ where }: { where: { idempotencyKey: string } }) => {
              return storedByKey.get(where.idempotencyKey) ?? null;
            },
          },
        });
      },
    } as any,
    {
      applyEvent: async () => {},
    } as BusinessFunnelProjectionService,
  );

  const result = await service.record(
    {
      eventName: "page_view",
      eventVersion: 1,
      idempotencyKey: "journey-1:visit-1:page_view",
      metadata: {
        occurredAt: "2026-04-22T12:00:00.000Z",
        route: "/adaptar",
      },
    },
    baseContext,
    "frontend",
  );

  assert.equal(result.ingested, true);
  assert.equal(result.event.eventName, "page_view");
});

test("rejects frontend emission of payment_failed", async () => {
  const service = new BusinessFunnelEventService(
    {
      $transaction: async () => {
        throw new Error("transaction should not be called");
      },
    } as any,
    {
      applyEvent: async () => {
        throw new Error("projection should not be called");
      },
    } as BusinessFunnelProjectionService,
  );

  await assert.rejects(
    service.record(
      {
        eventName: "payment_failed",
        eventVersion: 1,
      },
      baseContext,
      "frontend",
    ),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match((error as BadRequestException).message, /ownership/i);
      return true;
    },
  );
});
