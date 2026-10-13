import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { JobSourcesService } from "./job-sources.service";

// A cascata passa pelo JobLifecycle (status + Indexing API + cache do front):
// o fake registra cada closeJobs no lugar do updateMany direto.
function makeLifecycle(calls: unknown[]) {
  return {
    closeJobs: async (args: { where: unknown; status: string }) => {
      calls.push({ where: args.where, data: { status: args.status } });
      return { count: calls.length, slugs: [] };
    },
  };
}

function makeDatabase(overrides: Record<string, unknown> = {}) {
  const jobUpdateManyCalls: unknown[] = [];
  const database = {
    jobSource: {
      findUnique: async () => ({
        id: "js1",
        isActive: true,
        company: {},
        ingestionRuns: [],
      }),
      update: async (args: unknown) => {
        (database as Record<string, unknown>)._lastUpdateArgs = args;
        return { id: "js1", isActive: false, company: {}, ingestionRuns: [] };
      },
      updateMany: async () => ({ count: 3 }),
    },
    job: {
      updateMany: async (args: unknown) => {
        jobUpdateManyCalls.push(args);
        return { count: jobUpdateManyCalls.length };
      },
    },
    ...overrides,
  };
  return {
    database,
    jobUpdateManyCalls,
    lifecycle: makeLifecycle(jobUpdateManyCalls),
  };
}

test("update() marca vagas ativas como inactive quando isActive vira false", async () => {
  const { database, jobUpdateManyCalls, lifecycle } = makeDatabase();
  const service = new JobSourcesService(
    database as never,
    {} as never,
    lifecycle as never,
  );

  await service.update("js1", { isActive: false } as never);

  assert.equal(jobUpdateManyCalls.length, 1);
  assert.deepEqual(jobUpdateManyCalls[0], {
    where: { jobSourceId: "js1", status: "active" },
    data: { status: "inactive" },
  });
});

test("update() nao toca em Job quando isActive nao muda ou vira true", async () => {
  const {
    database: db1,
    jobUpdateManyCalls: calls1,
    lifecycle: lc1,
  } = makeDatabase();
  const service1 = new JobSourcesService(
    db1 as never,
    {} as never,
    lc1 as never,
  );
  await service1.update("js1", { sourceName: "Nova fonte" } as never);
  assert.equal(calls1.length, 0);

  const {
    database: db2,
    jobUpdateManyCalls: calls2,
    lifecycle: lc2,
  } = makeDatabase();
  const service2 = new JobSourcesService(
    db2 as never,
    {} as never,
    lc2 as never,
  );
  await service2.update("js1", { isActive: true } as never);
  assert.equal(calls2.length, 0);
});

test("bulkUpdateActive() marca vagas ativas do sourceType como inactive quando isActive=false", async () => {
  const { database, jobUpdateManyCalls, lifecycle } = makeDatabase();
  const service = new JobSourcesService(
    database as never,
    {} as never,
    lifecycle as never,
  );

  const result = await service.bulkUpdateActive({
    sourceType: "gupy" as never,
    isActive: false,
  });

  assert.equal(result.count, 3);
  assert.equal(jobUpdateManyCalls.length, 1);
  assert.deepEqual(jobUpdateManyCalls[0], {
    where: { status: "active", jobSource: { sourceType: "gupy" } },
    data: { status: "inactive" },
  });
});

test("bulkUpdateActive() nao toca em Job quando isActive=true", async () => {
  const { database, jobUpdateManyCalls, lifecycle } = makeDatabase();
  const service = new JobSourcesService(
    database as never,
    {} as never,
    lifecycle as never,
  );

  await service.bulkUpdateActive({
    sourceType: "gupy" as never,
    isActive: true,
  });

  assert.equal(jobUpdateManyCalls.length, 0);
});
