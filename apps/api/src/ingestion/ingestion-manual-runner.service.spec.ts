import assert from "node:assert/strict";
import { test } from "node:test";

import { IngestionManualRunnerService } from "./ingestion-manual-runner.service";

function createServiceFixture(
  config: { errorDelayMs: number; normalDelayMs: number } = {
    errorDelayMs: 0,
    normalDelayMs: 0,
  },
) {
  let beforeMarkRunning: ((itemId: string) => void) | undefined;
  let onAcquireItemLock: ((itemId: string) => boolean | undefined) | undefined;
  const runs = new Map<
    string,
    {
      id: string;
      status:
        | "queued"
        | "running"
        | "cancelling"
        | "completed"
        | "failed"
        | "cancelled";
      cancelRequestedAt: Date | null;
      succeededCount: number;
      failedCount: number;
      skippedCount: number;
      totalSources: number;
      createdAt: Date;
      startedAt: Date | null;
      finishedAt: Date | null;
    }
  >();
  const items = new Map<
    string,
    {
      id: string;
      batchRunId: string;
      jobSourceId: string;
      status:
        | "queued"
        | "running"
        | "completed"
        | "failed"
        | "skipped"
        | "cancelled";
      errorMessage: string | null;
      createdAt: Date;
      startedAt: Date | null;
      finishedAt: Date | null;
    }
  >();
  const runJobSourceCalls: string[] = [];

  const lockRepository = {
    acquire: async (lockId: string) => {
      if (lockId.startsWith("job-source:")) {
        const jobSourceId = lockId.replace("job-source:", "");
        const item = Array.from(items.values()).find(
          (candidate) => candidate.jobSourceId === jobSourceId,
        );
        const override = onAcquireItemLock?.(item?.id ?? "");
        if (typeof override === "boolean") {
          return override;
        }
      }
      return true;
    },
    release: async () => undefined,
  };

  const database = {
    ingestionBatchRun: {
      findFirst: async () => {
        const candidates = Array.from(runs.values())
          .filter((run) =>
            ["queued", "running", "cancelling"].includes(run.status),
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return candidates[0] ?? null;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        runs.get(where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const run = runs.get(where.id);
        assert.ok(run);
        const next = { ...run };
        for (const [key, value] of Object.entries(data)) {
          if (
            value &&
            typeof value === "object" &&
            "increment" in value &&
            typeof (value as { increment: unknown }).increment === "number"
          ) {
            const current = next[key as keyof typeof next];
            const increment = (value as { increment: number }).increment;
            (next as Record<string, unknown>)[key] =
              Number(current ?? 0) + increment;
            continue;
          }
          (next as Record<string, unknown>)[key] = value;
        }
        runs.set(where.id, next);
        return next;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status?: { in: string[] } };
        data: Record<string, unknown>;
      }) => {
        const run = runs.get(where.id);
        if (!run) return { count: 0 };
        if (where.status && !where.status.in.includes(run.status))
          return { count: 0 };
        runs.set(where.id, { ...run, ...data });
        return { count: 1 };
      },
    },
    ingestionBatchItem: {
      findMany: async ({
        where,
      }: {
        where: {
          batchRunId: string;
          status?: { in: string[] } | string;
          startedAt?: { lt: Date };
        };
      }) =>
        Array.from(items.values())
          .filter((item) => item.batchRunId === where.batchRunId)
          .filter((item) => {
            if (!where.status) return true;
            if (typeof where.status === "string") {
              return item.status === where.status;
            }
            return where.status.in.includes(item.status);
          })
          .filter((item) => {
            if (!where.startedAt) return true;
            return Boolean(
              item.startedAt &&
                item.startedAt.getTime() < where.startedAt.lt.getTime(),
            );
          })
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      count: async ({
        where,
      }: {
        where: { batchRunId: string; status?: { in: string[] } | string };
      }) =>
        Array.from(items.values())
          .filter((item) => item.batchRunId === where.batchRunId)
          .filter((item) => {
            if (!where.status) return true;
            if (typeof where.status === "string") {
              return item.status === where.status;
            }
            return where.status.in.includes(item.status);
          }).length,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const item = items.get(where.id);
        assert.ok(item);
        if (data.status === "running") {
          beforeMarkRunning?.(where.id);
        }
        const next = { ...item, ...data };
        items.set(where.id, next);
        return next;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { batchRunId?: string; id?: string; status: { in: string[] } };
        data: Record<string, unknown>;
      }) => {
        if (data.status === "running" && where.id) {
          beforeMarkRunning?.(where.id);
        }
        let count = 0;
        for (const item of items.values()) {
          if (where.batchRunId && item.batchRunId !== where.batchRunId)
            continue;
          if (where.id && item.id !== where.id) continue;
          if (!where.status.in.includes(item.status)) continue;
          items.set(item.id, { ...item, ...data });
          count += 1;
        }
        return { count };
      },
    },
  };

  const slowJobResolvers = new Map<string, () => void>();

  const ingestionService = {
    runJobSource: async (jobSourceId: string) => {
      runJobSourceCalls.push(jobSourceId);
      if (jobSourceId === "source-fail") {
        throw new Error("boom");
      }
      if (jobSourceId === "source-partial-fail") {
        return {
          errorSummary: "2 item(s) failed during ingestion.",
          id: `run-${jobSourceId}`,
          status: "failed" as const,
        };
      }
      if (jobSourceId.startsWith("source-slow")) {
        await new Promise<void>((resolve) => {
          slowJobResolvers.set(jobSourceId, resolve);
        });
        return { id: `run-${jobSourceId}`, status: "completed" as const };
      }
      const run = runs.get("batch-cancel");
      if (run && jobSourceId === "source-cancel-1") {
        runs.set("batch-cancel", {
          ...run,
          cancelRequestedAt: new Date(),
          status: "cancelling",
        });
      }
      return { id: `run-${jobSourceId}`, status: "completed" as const };
    },
  };

  const globalConfigService = {
    getConfig: async () => config,
  };

  const service = new IngestionManualRunnerService(
    database as never,
    ingestionService as never,
    lockRepository as never,
    globalConfigService as never,
  );

  return {
    items,
    lockRepository,
    resolveSlowJob(jobSourceId: string) {
      slowJobResolvers.get(jobSourceId)?.();
    },
    runJobSourceCalls,
    runs,
    service,
    setBeforeMarkRunning(callback: (itemId: string) => void) {
      beforeMarkRunning = callback;
    },
    setOnAcquireItemLock(callback: (itemId: string) => boolean | undefined) {
      onAcquireItemLock = callback;
    },
  };
}

test("runner processes queued adapter batch sequentially", async () => {
  const { items, runJobSourceCalls, runs, service } = createServiceFixture();
  runs.set("batch-1", {
    id: "batch-1",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 2,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  items.set("item-1", {
    id: "item-1",
    batchRunId: "batch-1",
    jobSourceId: "source-1",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  items.set("item-2", {
    id: "item-2",
    batchRunId: "batch-1",
    jobSourceId: "source-2",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:01.000Z"),
    startedAt: null,
    finishedAt: null,
  });

  await service.processNextBatchRun();

  const run = runs.get("batch-1");
  assert.equal(run?.status, "completed");
  assert.equal(run?.succeededCount, 2);
  assert.equal(run?.failedCount, 0);
  assert.equal(run?.skippedCount, 0);
  assert.deepEqual(runJobSourceCalls, ["source-1", "source-2"]);
  assert.equal(items.get("item-1")?.status, "completed");
  assert.equal(items.get("item-2")?.status, "completed");
});

test("runner waits a jittered delay between sources instead of running them back-to-back", async () => {
  const { items, runs, service } = createServiceFixture({
    errorDelayMs: 0,
    normalDelayMs: 100,
  });
  runs.set("batch-delay", {
    id: "batch-delay",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 2,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  items.set("item-delay-1", {
    id: "item-delay-1",
    batchRunId: "batch-delay",
    jobSourceId: "source-delay-1",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  items.set("item-delay-2", {
    id: "item-delay-2",
    batchRunId: "batch-delay",
    jobSourceId: "source-delay-2",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:01.000Z"),
    startedAt: null,
    finishedAt: null,
  });

  const startedAt = Date.now();
  await service.processNextBatchRun();
  const elapsedMs = Date.now() - startedAt;

  // normalDelayMs=100 with a 0.7-1.3x jitter window: at least one delay
  // must have been applied between the two sources (min ~70ms), and none
  // after the last item (so this stays well under 2x the base delay).
  assert.ok(
    elapsedMs >= 60,
    `expected a delay between sources, got ${elapsedMs}ms`,
  );
  assert.ok(
    elapsedMs < 300,
    `expected no delay after the last item, got ${elapsedMs}ms`,
  );
  assert.equal(runs.get("batch-delay")?.status, "completed");
});

test("runner marks failed item and batch as failed", async () => {
  const { items, runs, service } = createServiceFixture();
  runs.set("batch-2", {
    id: "batch-2",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  items.set("item-fail", {
    id: "item-fail",
    batchRunId: "batch-2",
    jobSourceId: "source-fail",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });

  await service.processNextBatchRun();

  const run = runs.get("batch-2");
  assert.equal(run?.status, "failed");
  assert.equal(run?.failedCount, 1);
  assert.equal(items.get("item-fail")?.status, "failed");
});

test("runner marks item and batch as failed when adapter run resolves with partial failures", async () => {
  const { items, runs, service } = createServiceFixture();
  runs.set("batch-partial-fail", {
    id: "batch-partial-fail",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  items.set("item-partial-fail", {
    id: "item-partial-fail",
    batchRunId: "batch-partial-fail",
    jobSourceId: "source-partial-fail",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });

  await service.processNextBatchRun();

  const run = runs.get("batch-partial-fail");
  const item = items.get("item-partial-fail");
  assert.equal(run?.status, "failed");
  assert.equal(run?.failedCount, 1);
  assert.equal(run?.succeededCount, 0);
  assert.equal(item?.status, "failed");
  assert.equal(item?.errorMessage, "2 item(s) failed during ingestion.");
});

test("runner stops scheduling remaining items when cancellation is requested", async () => {
  const { items, runJobSourceCalls, runs, service } = createServiceFixture();
  runs.set("batch-cancel", {
    id: "batch-cancel",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 2,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  items.set("item-cancel-1", {
    id: "item-cancel-1",
    batchRunId: "batch-cancel",
    jobSourceId: "source-cancel-1",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  items.set("item-cancel-2", {
    id: "item-cancel-2",
    batchRunId: "batch-cancel",
    jobSourceId: "source-cancel-2",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:01.000Z"),
    startedAt: null,
    finishedAt: null,
  });

  await service.processNextBatchRun();

  const run = runs.get("batch-cancel");
  assert.equal(run?.status, "cancelled");
  assert.equal(run?.succeededCount, 1);
  assert.equal(items.get("item-cancel-1")?.status, "completed");
  assert.equal(items.get("item-cancel-2")?.status, "cancelled");
  assert.deepEqual(runJobSourceCalls, ["source-cancel-1"]);
});

test("runner keeps cancelling run with no pending items as cancelled", async () => {
  const { runs, service } = createServiceFixture();
  runs.set("batch-cancelling-empty", {
    id: "batch-cancelling-empty",
    status: "cancelling",
    cancelRequestedAt: new Date("2026-01-01T00:00:00.000Z"),
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });

  await service.processNextBatchRun();

  const run = runs.get("batch-cancelling-empty");
  assert.equal(run?.status, "cancelled");
  assert.equal(run?.finishedAt instanceof Date, true);
});

test("runner finalizes queued run with no items as completed", async () => {
  const { runs, service } = createServiceFixture();
  runs.set("batch-empty", {
    id: "batch-empty",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });

  await service.processNextBatchRun();

  const run = runs.get("batch-empty");
  assert.equal(run?.status, "completed");
  assert.equal(run?.finishedAt instanceof Date, true);
});

test("runner ignores item that becomes terminal before start due to race", async () => {
  const { items, runJobSourceCalls, runs, service, setBeforeMarkRunning } =
    createServiceFixture();
  runs.set("batch-race-terminal", {
    id: "batch-race-terminal",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  items.set("item-race", {
    id: "item-race",
    batchRunId: "batch-race-terminal",
    jobSourceId: "source-race",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  setBeforeMarkRunning((itemId) => {
    if (itemId === "item-race") {
      const item = items.get(itemId);
      assert.ok(item);
      items.set(itemId, {
        ...item,
        status: "completed",
        finishedAt: new Date(),
      });
    }
  });

  await service.processNextBatchRun();

  const run = runs.get("batch-race-terminal");
  assert.equal(items.get("item-race")?.status, "completed");
  assert.equal(run?.status, "completed");
  assert.equal(run?.succeededCount, 1);
  assert.equal(run?.failedCount, 0);
  assert.equal(run?.skippedCount, 0);
  assert.deepEqual(runJobSourceCalls, []);
});

test("runner reconciles counters when item is externally failed before local markRunning", async () => {
  const { items, runs, service, setBeforeMarkRunning } = createServiceFixture();
  runs.set("batch-race-external-fail", {
    id: "batch-race-external-fail",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  items.set("item-race-external-fail", {
    id: "item-race-external-fail",
    batchRunId: "batch-race-external-fail",
    jobSourceId: "source-race-external-fail",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });

  setBeforeMarkRunning((itemId) => {
    if (itemId === "item-race-external-fail") {
      const item = items.get(itemId);
      assert.ok(item);
      items.set(itemId, {
        ...item,
        errorMessage: "external failure",
        finishedAt: new Date(),
        status: "failed",
      });
    }
  });

  await service.processNextBatchRun();

  const run = runs.get("batch-race-external-fail");
  assert.equal(items.get("item-race-external-fail")?.status, "failed");
  assert.equal(run?.status, "failed");
  assert.equal(run?.succeededCount, 0);
  assert.equal(run?.failedCount, 1);
  assert.equal(run?.skippedCount, 0);
});

test("runner does not double count skipped when item is already cancelled", async () => {
  const { items, runs, service, setOnAcquireItemLock } = createServiceFixture();
  runs.set("batch-race-cancelled", {
    id: "batch-race-cancelled",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  items.set("item-race-cancelled", {
    id: "item-race-cancelled",
    batchRunId: "batch-race-cancelled",
    jobSourceId: "source-race-cancelled",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  setOnAcquireItemLock((itemId) => {
    if (itemId === "item-race-cancelled") {
      const item = items.get(itemId);
      assert.ok(item);
      items.set(itemId, {
        ...item,
        status: "cancelled",
        finishedAt: new Date(),
      });
      return false;
    }
  });

  await service.processNextBatchRun();

  const run = runs.get("batch-race-cancelled");
  assert.equal(items.get("item-race-cancelled")?.status, "cancelled");
  assert.equal(run?.skippedCount, 1);
});

test("runner does not re-mark already running item that started recently", async () => {
  const { items, runJobSourceCalls, runs, service } = createServiceFixture();
  runs.set("batch-existing-running", {
    id: "batch-existing-running",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  // Comecou ha poucos segundos — ainda esta genuinamente em andamento em
  // algum outro processo, nao deve ser tratado como preso/abandonado.
  const startedAt = new Date(Date.now() - 5_000);
  items.set("item-existing-running", {
    id: "item-existing-running",
    batchRunId: "batch-existing-running",
    jobSourceId: "source-existing-running",
    status: "running",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt,
    finishedAt: null,
  });

  await service.processNextBatchRun();

  const item = items.get("item-existing-running");
  const run = runs.get("batch-existing-running");
  assert.equal(item?.status, "running");
  assert.equal(item?.startedAt?.toISOString(), startedAt.toISOString());
  assert.deepEqual(runJobSourceCalls, []);
  // Bug real da Sprint 6C: essa invocacao nao conseguiu reivindicar o
  // item (genuinamente em andamento em outro processo), mas finalizava o
  // lote como "completed" com contagem 0 mesmo assim. O lote precisa
  // ficar em aberto ate quem realmente estiver terminando o item chegar
  // la e finalizar com a contagem certa.
  assert.equal(run?.status, "running");
  assert.equal(run?.succeededCount, 0);
  assert.equal(run?.failedCount, 0);
  assert.equal(run?.skippedCount, 0);
});

// Reproduz o bug real da Sprint 6C: o Workday passou a demorar mais que
// o TTL do lock externo (5min) pra processar uma fonte grande. O lock
// expirava no meio do item, um tick concorrente do cron assumia o lote,
// via o item "running" (nao conseguia reivindicar) e mesmo assim fechava
// o lote como "completed" com contagem 0 — a vaga era ingerida de
// verdade minutos depois, mas a UI ja mostrava o lote errado havia tempo.
test("runner does not close the batch as completed while another invocation is still mid-item", async () => {
  const {
    items,
    resolveSlowJob,
    runJobSourceCalls,
    runs,
    service,
    setBeforeMarkRunning,
  } = createServiceFixture();

  runs.set("batch-slow-race", {
    id: "batch-slow-race",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  items.set("item-slow", {
    id: "item-slow",
    batchRunId: "batch-slow-race",
    jobSourceId: "source-slow-1",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });

  let overlapFired = false;
  let overlapPromise: Promise<void> | undefined;
  setBeforeMarkRunning(() => {
    if (overlapFired) return;
    overlapFired = true;
    // Simula o tick do cron que chega enquanto o item ainda esta sendo
    // processado pela primeira invocacao (lock externo ja expirado).
    overlapPromise = service.processNextBatchRun();
  });

  const firstRun = service.processNextBatchRun();

  // Deixa a invocacao concorrente rodar ate o fim antes de liberar o job
  // "lento" — ela precisa desistir de fechar o lote.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await overlapPromise;

  assert.equal(runs.get("batch-slow-race")?.status, "running");
  assert.equal(runs.get("batch-slow-race")?.succeededCount, 0);
  assert.equal(items.get("item-slow")?.status, "running");

  resolveSlowJob("source-slow-1");
  await firstRun;

  assert.deepEqual(runJobSourceCalls, ["source-slow-1"]);
  assert.equal(items.get("item-slow")?.status, "completed");
  assert.equal(runs.get("batch-slow-race")?.status, "completed");
  assert.equal(runs.get("batch-slow-race")?.succeededCount, 1);
  assert.equal(runs.get("batch-slow-race")?.failedCount, 0);
});

test("runner recovers an item stuck running from a dead process and reprocesses it", async () => {
  const { items, runJobSourceCalls, runs, service } = createServiceFixture();
  runs.set("batch-stale-item", {
    id: "batch-stale-item",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalSources: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });
  // Comecou ha muito mais que o TTL do lock de item — o processo que
  // marcou "running" morreu no meio (deploy, restart, crash) e nunca
  // avancou o status. Sem recuperacao, o where clause de markRunning
  // (status in ["queued"]) nunca casaria e esse item ficaria pulado pra
  // sempre.
  items.set("item-stale", {
    id: "item-stale",
    batchRunId: "batch-stale-item",
    jobSourceId: "source-stale-recovery",
    status: "running",
    errorMessage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    finishedAt: null,
  });

  await service.processNextBatchRun();

  const item = items.get("item-stale");
  const run = runs.get("batch-stale-item");
  assert.deepEqual(runJobSourceCalls, ["source-stale-recovery"]);
  assert.equal(item?.status, "completed");
  assert.equal(run?.status, "completed");
  assert.equal(run?.succeededCount, 1);
});

test("runner clamps aggregate counters to totalSources on finalize", async () => {
  const { runs, service } = createServiceFixture();
  runs.set("batch-clamp", {
    id: "batch-clamp",
    status: "queued",
    cancelRequestedAt: null,
    succeededCount: 1,
    failedCount: 1,
    skippedCount: 1,
    totalSources: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
  });

  await service.processNextBatchRun();

  const run = runs.get("batch-clamp");
  assert.ok(run);
  assert.equal(
    run.succeededCount + run.failedCount + run.skippedCount <= run.totalSources,
    true,
  );
});
