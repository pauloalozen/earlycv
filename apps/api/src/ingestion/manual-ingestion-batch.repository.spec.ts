import assert from "node:assert/strict";
import { test } from "node:test";

import { ManualIngestionBatchRepository } from "./manual-ingestion-batch.repository";

test("repository creates adapter batch with queued items", async () => {
  const createdRun = {
    id: "batch-1",
    scopeType: "adapter",
    scopeValue: "gupy",
    status: "queued",
    totalSources: 2,
  };

  let createManyPayload: Array<Record<string, unknown>> = [];
  const tx = {
    ingestionBatchRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assert.equal(data.scopeType, "adapter");
        assert.equal(data.scopeValue, "gupy");
        return createdRun;
      },
    },
    jobSource: {
      findMany: async () => [
        {
          id: "source-1",
          companyId: "company-1",
          company: { name: "Company 1" },
          sourceName: "Source 1",
          sourceType: "gupy",
        },
        {
          id: "source-2",
          companyId: "company-2",
          company: { name: "Company 2" },
          sourceName: "Source 2",
          sourceType: "gupy",
        },
      ],
    },
    ingestionBatchItem: {
      createMany: async ({
        data,
      }: {
        data: Array<Record<string, unknown>>;
      }) => {
        createManyPayload = data;
        return { count: 2 };
      },
    },
  };
  const database = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => callback(tx),
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  const result = await repository.createAdapterBatchRun({
    adapterType: "gupy",
    requestedByUserId: "admin-1",
  });

  assert.equal(result.status, "queued");
  assert.equal(result.totalSources, 2);
  assert.equal(createManyPayload.length, 2);
});

test("repository lists runs with optional filters", async () => {
  let capturedWhere: Record<string, unknown> | undefined;
  const database = {
    ingestionBatchRun: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedWhere = where;
        return [];
      },
    },
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  await repository.listRuns({ scopeType: "adapter", status: "queued" });

  assert.deepEqual(capturedWhere, { scopeType: "adapter", status: "queued" });
});

test("repository gets run by id and lists filtered items", async () => {
  let capturedItemWhere: Record<string, unknown> | undefined;
  const database = {
    ingestionBatchRun: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        assert.deepEqual(where, { id: "batch-1" });
        return { id: "batch-1" };
      },
    },
    ingestionBatchItem: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedItemWhere = where;
        return [];
      },
    },
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  const run = await repository.getRunById("batch-1");
  await repository.listRunItems("batch-1", { status: "queued" });

  assert.deepEqual(run, { id: "batch-1" });
  assert.deepEqual(capturedItemWhere, {
    batchRunId: "batch-1",
    status: "queued",
  });
});

test("repository marks cancel requested with status transition", async () => {
  const now = new Date();
  const database = {
    ingestionBatchRun: {
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        assert.deepEqual(where, {
          id: "batch-1",
          status: { in: ["queued", "running"] },
        });
        assert.equal(data.status, "cancelling");
        assert.equal(data.cancelRequestedAt instanceof Date, true);
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        assert.deepEqual(where, { id: "batch-1" });
        return { id: "batch-1", status: "cancelling", cancelRequestedAt: now };
      },
    },
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  const result = await repository.markCancelRequested("batch-1");

  assert.equal(result.status, "cancelling");
});
