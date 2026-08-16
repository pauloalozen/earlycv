import assert from "node:assert/strict";
import { test } from "node:test";

import type { IngestionJob } from "@prisma/client";
import type { DatabaseService } from "../database/database.service";
import { IngestionJobDispatchService } from "./ingestion-job-dispatch.service";
import type { JobEnrichmentWorker } from "./job-enrichment.worker";
import type { ManualIngestionBatchRepository } from "./manual-ingestion-batch.repository";

function createJob(overrides: Partial<IngestionJob> = {}): IngestionJob {
  return {
    adapterType: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    description: null,
    id: "job-1",
    isEnabled: true,
    jobSourceId: null,
    jobType: "CRAWL",
    lastRunAt: null,
    name: "job",
    nextRunAt: new Date("2026-08-04T10:00:00.000Z"),
    onlyMissingLogo: false,
    scheduleDaysOfWeek: [],
    scheduleHour: null,
    scheduleInterval: 2,
    scheduleMinute: 0,
    scheduleType: "EVERY_N_HOURS",
    scopeType: "ALL",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createFixture() {
  const jobRuns = new Map<string, Record<string, unknown>>();
  const jobUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];
  let nextRunId = 1;

  const database = {
    ingestionJob: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        jobUpdates.push({ data, id: where.id });
        return { id: where.id, ...data };
      },
    },
    ingestionJobRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `run-${nextRunId++}`;
        const run = { id, ...data };
        jobRuns.set(id, run);
        return run;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const run = jobRuns.get(where.id);
        if (!run) throw new Error("not found");
        return run;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const run = jobRuns.get(where.id);
        const updated = { ...run, ...data };
        jobRuns.set(where.id, updated);
        return updated;
      },
    },
  } as unknown as DatabaseService;

  const createdBatchRuns: unknown[] = [];
  const logoFetchInputs: { adapterType?: string; onlyMissingLogo?: boolean }[] =
    [];
  const manualBatchRepository = {
    createAdapterBatchRun: async () => {
      const run = { id: "batch-adapter", status: "queued", totalSources: 1 };
      createdBatchRuns.push(run);
      return run;
    },
    createGlobalBatchRun: async () => {
      const run = { id: "batch-global", status: "queued", totalSources: 3 };
      createdBatchRuns.push(run);
      return run;
    },
    createSourceBatchRun: async () => {
      const run = { id: "batch-source", status: "queued", totalSources: 1 };
      createdBatchRuns.push(run);
      return run;
    },
    createLogoFetchBatchRun: async (input: {
      adapterType?: string;
      onlyMissingLogo?: boolean;
    }) => {
      const run = {
        id: input.adapterType ? "batch-logo-adapter" : "batch-logo-global",
        status: "queued",
        totalSources: 1,
      };
      createdBatchRuns.push(run);
      logoFetchInputs.push(input);
      return run;
    },
  } as unknown as ManualIngestionBatchRepository;

  let runNowCalls = 0;
  const enrichmentWorker = {
    runNow: async () => {
      runNowCalls += 1;
      return 5;
    },
  } as unknown as JobEnrichmentWorker;

  const service = new IngestionJobDispatchService(
    database,
    manualBatchRepository,
    enrichmentWorker,
  );

  return {
    createdBatchRuns,
    getJobUpdates: () => jobUpdates,
    getRunNowCalls: () => runNowCalls,
    jobRuns,
    logoFetchInputs,
    service,
  };
}

test("dispatchJob CRAWL cria IngestionBatchRun e atualiza nextRunAt", async () => {
  const { service, createdBatchRuns, getJobUpdates } = createFixture();
  const job = createJob({ jobType: "CRAWL", scopeType: "ALL" });

  const run = await service.dispatchJob(job, "SCHEDULE");

  assert.equal(createdBatchRuns.length, 1);
  assert.equal(run.status, "RUNNING");
  assert.equal(run.batchRunId, "batch-global");

  const jobUpdates = getJobUpdates();
  assert.equal(jobUpdates.length, 1);
  assert.ok(jobUpdates[0]?.data.lastRunAt instanceof Date);
  assert.ok(jobUpdates[0]?.data.nextRunAt instanceof Date);
});

test("dispatchJob grava jobName/jobType na IngestionJobRun (snapshot que sobrevive a exclusao do job)", async () => {
  const { service, jobRuns } = createFixture();
  const job = createJob({
    jobType: "CRAWL",
    name: "Gupy diario",
    scopeType: "ALL",
  });

  const run = await service.dispatchJob(job, "SCHEDULE");

  const stored = jobRuns.get(run.id);
  assert.equal(stored?.jobName, "Gupy diario");
  assert.equal(stored?.jobType, "CRAWL");
});

test("dispatchJob ENRICHMENT chama runNow() do worker e atualiza nextRunAt", async () => {
  const { service, getRunNowCalls, getJobUpdates } = createFixture();
  const job = createJob({
    jobType: "ENRICHMENT",
    scheduleInterval: null,
    scheduleType: "MANUAL",
    scopeType: null,
  });

  const run = await service.dispatchJob(job, "MANUAL");

  assert.equal(getRunNowCalls(), 1);
  assert.equal(run.status, "COMPLETED");
  assert.equal(run.triggeredBy, "MANUAL");

  const jobUpdates = getJobUpdates();
  assert.equal(jobUpdates.length, 1);
  // MANUAL nunca reagenda
  assert.equal(jobUpdates[0]?.data.nextRunAt, null);
});

test("dispatchJob LOGO_FETCH com escopo ADAPTER cria batch de logo escopado ao adapter", async () => {
  const { service, createdBatchRuns } = createFixture();
  const job = createJob({
    jobType: "LOGO_FETCH",
    scopeType: "ADAPTER",
    adapterType: "gupy",
  });

  const run = await service.dispatchJob(job, "MANUAL");

  assert.equal(createdBatchRuns.length, 1);
  assert.equal(run.status, "RUNNING");
  assert.equal(run.batchRunId, "batch-logo-adapter");
});

test("dispatchJob LOGO_FETCH com escopo ALL cria batch de logo sem adapter especifico", async () => {
  const { service, createdBatchRuns } = createFixture();
  const job = createJob({ jobType: "LOGO_FETCH", scopeType: "ALL" });

  const run = await service.dispatchJob(job, "MANUAL");

  assert.equal(createdBatchRuns.length, 1);
  assert.equal(run.batchRunId, "batch-logo-global");
});

test("dispatchJob LOGO_FETCH repassa onlyMissingLogo do job pro repository (ADAPTER e ALL)", async () => {
  const { service, logoFetchInputs } = createFixture();

  await service.dispatchJob(
    createJob({
      adapterType: "gupy",
      jobType: "LOGO_FETCH",
      onlyMissingLogo: true,
      scopeType: "ADAPTER",
    }),
    "MANUAL",
  );
  await service.dispatchJob(
    createJob({
      jobType: "LOGO_FETCH",
      onlyMissingLogo: true,
      scopeType: "ALL",
    }),
    "MANUAL",
  );

  assert.equal(logoFetchInputs.length, 2);
  assert.equal(logoFetchInputs[0]?.onlyMissingLogo, true);
  assert.equal(logoFetchInputs[1]?.onlyMissingLogo, true);
});

test("dispatchJob LOGO_FETCH com escopo SOURCE falha (nao suportado)", async () => {
  const { service, getJobUpdates } = createFixture();
  const job = createJob({
    jobType: "LOGO_FETCH",
    scopeType: "SOURCE",
    jobSourceId: "source-1",
  });

  await assert.rejects(() => service.dispatchJob(job, "MANUAL"));

  const jobUpdates = getJobUpdates();
  assert.equal(jobUpdates.length, 1);
});
