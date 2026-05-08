import assert from "node:assert/strict";
import { test } from "node:test";

import { BusinessFunnelProjectionService } from "./business-funnel-projection.service";

type SourceEvent = {
  correlationId: string;
  createdAt: Date;
  eventName: string;
  metadataJson: Record<string, unknown> | null;
  requestId: string;
  sessionInternalId: string | null;
  userId: string | null;
};

test("derives conversion, drop-off, and transition latency metrics by day", async () => {
  const events: SourceEvent[] = [
    {
      correlationId: "corr-a-1",
      createdAt: new Date("2026-04-21T10:00:00.000Z"),
      eventName: "landing_viewed",
      metadataJson: null,
      requestId: "req-a-1",
      sessionInternalId: "session-a",
      userId: "user-a",
    },
    {
      correlationId: "corr-a-2",
      createdAt: new Date("2026-04-21T10:00:10.000Z"),
      eventName: "analysis_started",
      metadataJson: null,
      requestId: "req-a-2",
      sessionInternalId: "session-a",
      userId: "user-a",
    },
    {
      correlationId: "corr-a-3",
      createdAt: new Date("2026-04-21T10:00:40.000Z"),
      eventName: "analysis_completed",
      metadataJson: { outcome: "success" },
      requestId: "req-a-3",
      sessionInternalId: "session-a",
      userId: "user-a",
    },
    {
      correlationId: "corr-b-1",
      createdAt: new Date("2026-04-21T10:05:00.000Z"),
      eventName: "landing_viewed",
      metadataJson: null,
      requestId: "req-b-1",
      sessionInternalId: "session-b",
      userId: "user-b",
    },
    {
      correlationId: "corr-b-2",
      createdAt: new Date("2026-04-21T10:05:10.000Z"),
      eventName: "analysis_started",
      metadataJson: null,
      requestId: "req-b-2",
      sessionInternalId: "session-b",
      userId: "user-b",
    },
    {
      correlationId: "corr-c-1",
      createdAt: new Date("2026-04-21T10:06:00.000Z"),
      eventName: "landing_viewed",
      metadataJson: null,
      requestId: "req-c-1",
      sessionInternalId: "session-c",
      userId: "user-c",
    },
  ];

  const projection = new BusinessFunnelProjectionService({
    businessFunnelEvent: {
      findMany: async () => events,
    },
    // biome-ignore lint/suspicious/noExplicitAny: test mock
  } as any);

  const day = await projection.deriveDailyProjection(
    new Date("2026-04-21T00:00:00.000Z"),
  );

  const landing = day.stages.find(
    (stage) => stage.stageKey === "landing_viewed",
  );
  assert.ok(landing);
  assert.equal(landing.totalCount, 3);
  assert.equal(landing.conversionCount, 2);
  assert.equal(landing.dropOffCount, 1);
  assert.equal(landing.conversionRate, 2 / 3);
  assert.equal(landing.dropOffRate, 1 / 3);
  assert.equal(landing.avgStepDeltaMs, 10_000);

  const started = day.stages.find(
    (stage) => stage.stageKey === "analysis_started",
  );
  assert.ok(started);
  assert.equal(started.conversionCount, 1);
  assert.equal(started.dropOffCount, 1);
  assert.equal(started.conversionRate, 0.5);
  assert.equal(started.dropOffRate, 0.5);
  assert.equal(started.avgStepDeltaMs, 30_000);

  const transition = day.transitions.find(
    (entry) =>
      entry.fromStageKey === "analysis_started" &&
      entry.toStageKey === "analysis_completed",
  );
  assert.ok(transition);
  assert.equal(transition.totalCount, 1);
  assert.equal(transition.avgStepDeltaMs, 30_000);
});

test("rebuilds projection from source events deterministically", async () => {
  const events: SourceEvent[] = [
    {
      correlationId: "corr-a-1",
      createdAt: new Date("2026-04-21T10:00:00.000Z"),
      eventName: "landing_viewed",
      metadataJson: null,
      requestId: "req-a-1",
      sessionInternalId: "session-a",
      userId: "user-a",
    },
    {
      correlationId: "corr-a-2",
      createdAt: new Date("2026-04-21T10:00:10.000Z"),
      eventName: "analysis_started",
      metadataJson: null,
      requestId: "req-a-2",
      sessionInternalId: "session-a",
      userId: "user-a",
    },
    {
      correlationId: "corr-a-3",
      createdAt: new Date("2026-04-21T10:00:40.000Z"),
      eventName: "analysis_completed",
      metadataJson: { outcome: "success" },
      requestId: "req-a-3",
      sessionInternalId: "session-a",
      userId: "user-a",
    },
  ];

  let metricRows: Record<string, unknown>[] = [];

  const projection = new BusinessFunnelProjectionService({
    businessFunnelEvent: {
      findMany: async () => events,
    },
    businessFunnelStageMetric: {
      deleteMany: async () => {
        metricRows = [];
      },
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        metricRows = data.map((row) => ({ ...row }));
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: test mock
  } as any);

  const first = await projection.rebuildFromSource({
    from: new Date("2026-04-21T00:00:00.000Z"),
    to: new Date("2026-04-21T00:00:00.000Z"),
  });
  const firstRows = metricRows.map((row) => ({ ...row }));

  const second = await projection.rebuildFromSource({
    from: new Date("2026-04-21T00:00:00.000Z"),
    to: new Date("2026-04-21T00:00:00.000Z"),
  });

  assert.deepEqual(second, first);
  assert.deepEqual(metricRows, firstRows);

  const transitionRow = metricRows.find(
    (row) => row.stageKey === "transition:analysis_started->analysis_completed",
  );
  assert.ok(transitionRow);
  assert.equal(transitionRow.avgLatencyMs, 30_000);

  const derivedRow = metricRows.find(
    (row) => row.stageKey === "derived:analysis_started",
  );
  assert.ok(derivedRow);
  assert.equal(derivedRow.totalCount, 1);
  assert.equal(derivedRow.successCount, 1);
  assert.equal(derivedRow.errorCount, 0);
});

test("rebuildFromSource normalizes reversed date ranges for source and delete windows", async () => {
  let findManyWhere: {
    createdAt: {
      gte: Date;
      lt: Date;
    };
  } | null = null;
  let deleteManyWhere: {
    metricDate: {
      gte: Date;
      lte: Date;
    };
  } | null = null;

  const projection = new BusinessFunnelProjectionService({
    businessFunnelEvent: {
      findMany: async ({
        where,
      }: {
        where: { createdAt: { gte: Date; lt: Date } };
      }) => {
        findManyWhere = where;
        return [];
      },
    },
    businessFunnelStageMetric: {
      deleteMany: async ({
        where,
      }: {
        where: { metricDate: { gte: Date; lte: Date } };
      }) => {
        deleteManyWhere = where;
      },
      createMany: async () => {
        throw new Error(
          "createMany should not be called when there are no rows",
        );
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: test mock
  } as any);

  await projection.rebuildFromSource({
    from: new Date("2026-04-23T13:10:00.000Z"),
    to: new Date("2026-04-21T01:20:00.000Z"),
  });

  assert.deepEqual(findManyWhere, {
    createdAt: {
      gte: new Date("2026-04-21T00:00:00.000Z"),
      lt: new Date("2026-04-24T00:00:00.000Z"),
    },
  });
  assert.deepEqual(deleteManyWhere, {
    metricDate: {
      gte: new Date("2026-04-21T00:00:00.000Z"),
      lte: new Date("2026-04-23T00:00:00.000Z"),
    },
  });
});
