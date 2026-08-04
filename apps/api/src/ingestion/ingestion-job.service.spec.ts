import assert from "node:assert/strict";
import { test } from "node:test";

import type { IngestionJob, IngestionJobRun } from "@prisma/client";
import type { DatabaseService } from "../database/database.service";
import type { CreateIngestionJobDto } from "./dto/create-ingestion-job.dto";
import { IngestionJobService } from "./ingestion-job.service";
import type { IngestionJobDispatchService } from "./ingestion-job-dispatch.service";

function createFixture(seed: IngestionJob[] = []) {
  const jobs = new Map(seed.map((job) => [job.id, job]));
  const jobSources = new Map<string, { id: string }>([
    ["source-1", { id: "source-1" }],
  ]);
  let nextId = seed.length + 1;

  const database = {
    ingestionJob: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `job-${nextId++}`;
        const job = {
          createdAt: new Date(),
          isEnabled: true,
          id,
          updatedAt: new Date(),
          ...data,
        } as IngestionJob;
        jobs.set(id, job);
        return job;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        jobs.delete(where.id);
      },
      findMany: async () => Array.from(jobs.values()),
      findUnique: async ({ where }: { where: { id: string } }) =>
        jobs.get(where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<IngestionJob>;
      }) => {
        const existing = jobs.get(where.id);
        if (!existing) throw new Error("not found");
        const updated = { ...existing, ...data };
        jobs.set(where.id, updated);
        return updated;
      },
    },
    ingestionJobRun: {
      count: async () => 0,
      findMany: async () => [],
    },
    jobSource: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        jobSources.get(where.id) ?? null,
    },
  } as unknown as DatabaseService;

  const dispatchCalls: Array<{ job: IngestionJob; trigger: string }> = [];
  const dispatchService = {
    dispatchJob: async (job: IngestionJob, trigger: "SCHEDULE" | "MANUAL") => {
      dispatchCalls.push({ job, trigger });
      return { id: "run-1", triggeredBy: trigger } as IngestionJobRun;
    },
  } as unknown as IngestionJobDispatchService;

  const service = new IngestionJobService(database, dispatchService);

  return { dispatchCalls, jobs, service };
}

function baseDto(
  overrides: Partial<CreateIngestionJobDto> = {},
): CreateIngestionJobDto {
  return {
    jobType: "CRAWL",
    name: "job",
    scheduleType: "MANUAL",
    scopeType: "ALL",
    ...overrides,
  } as CreateIngestionJobDto;
}

test("create com scheduleType DAILY calcula nextRunAt corretamente", async () => {
  const { service } = createFixture();
  const job = await service.create(
    baseDto({ scheduleHour: 7, scheduleMinute: 0, scheduleType: "DAILY" }),
  );

  assert.ok(job.nextRunAt instanceof Date);
});

test("create com scheduleType MANUAL nao define nextRunAt", async () => {
  const { service } = createFixture();
  const job = await service.create(baseDto({ scheduleType: "MANUAL" }));

  assert.equal(job.nextRunAt, null);
});

test("toggle ativa/desativa e recalcula nextRunAt", async () => {
  const { service } = createFixture();
  const created = await service.create(
    baseDto({ scheduleHour: 7, scheduleMinute: 0, scheduleType: "DAILY" }),
  );

  const disabled = await service.toggle(created.id);
  assert.equal(disabled.isEnabled, false);
  assert.equal(disabled.nextRunAt, null);

  const reEnabled = await service.toggle(created.id);
  assert.equal(reEnabled.isEnabled, true);
  assert.ok(reEnabled.nextRunAt instanceof Date);
});

test("runNow cria IngestionJobRun com triggeredBy MANUAL", async () => {
  const { service, dispatchCalls } = createFixture();
  const created = await service.create(baseDto());

  const run = await service.runNow(created.id);

  assert.equal(dispatchCalls.length, 1);
  assert.equal(dispatchCalls[0]?.trigger, "MANUAL");
  assert.equal(run.triggeredBy, "MANUAL");
});

test("remove apaga o job", async () => {
  const { service, jobs } = createFixture();
  const created = await service.create(baseDto());

  await service.remove(created.id);

  assert.equal(jobs.has(created.id), false);
});
