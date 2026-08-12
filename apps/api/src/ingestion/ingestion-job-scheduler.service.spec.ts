import assert from "node:assert/strict";
import { test } from "node:test";

import type { IngestionJob } from "@prisma/client";
import type { DatabaseService } from "../database/database.service";
import type { IngestionJobDispatchService } from "./ingestion-job-dispatch.service";
import { IngestionJobSchedulerService } from "./ingestion-job-scheduler.service";
import type { IngestionLockRepository } from "./ingestion-lock.repository";

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

function createFixture(jobs: IngestionJob[]) {
  const database = {
    ingestionJob: {
      findMany: async ({
        where,
      }: {
        where: {
          isEnabled: boolean;
          nextRunAt: { lte: Date };
          scheduleType: { not: string };
        };
      }) =>
        jobs.filter(
          (job) =>
            job.isEnabled === where.isEnabled &&
            job.scheduleType !== where.scheduleType.not &&
            job.nextRunAt !== null &&
            job.nextRunAt.getTime() <= where.nextRunAt.lte.getTime(),
        ),
    },
  } as unknown as DatabaseService;

  const dispatchedJobIds: string[] = [];
  const dispatchService = {
    dispatchJob: async (job: IngestionJob) => {
      dispatchedJobIds.push(job.id);
      return { id: `run-${job.id}` };
    },
  } as unknown as IngestionJobDispatchService;

  const lockRepository = {
    acquire: async () => true,
    release: async () => {},
  } as unknown as IngestionLockRepository;

  const service = new IngestionJobSchedulerService(
    database,
    dispatchService,
    lockRepository,
  );

  return { dispatchedJobIds, service };
}

test("tick nao dispara jobs com nextRunAt no futuro", async () => {
  const futureJob = createJob({
    id: "future",
    nextRunAt: new Date("2026-08-05T10:00:00.000Z"),
  });
  const { service, dispatchedJobIds } = createFixture([futureJob]);

  const now = new Date("2026-08-04T10:00:00.000Z");
  const due = await service.findDueJobs(now);

  assert.equal(due.length, 0);
  assert.deepEqual(dispatchedJobIds, []);
});

test("tick dispara jobs com nextRunAt no passado/presente", async () => {
  const dueJob = createJob({
    id: "due",
    nextRunAt: new Date("2026-08-04T09:59:00.000Z"),
  });
  const { service } = createFixture([dueJob]);

  const now = new Date("2026-08-04T10:00:00.000Z");
  const due = await service.findDueJobs(now);

  assert.equal(due.length, 1);
  assert.equal(due[0]?.id, "due");
});

test("tick ignora jobs MANUAL mesmo com nextRunAt nulo", async () => {
  const manualJob = createJob({
    id: "manual",
    nextRunAt: null,
    scheduleType: "MANUAL",
  });
  const { service } = createFixture([manualJob]);

  const due = await service.findDueJobs(new Date("2026-08-04T10:00:00.000Z"));

  assert.equal(due.length, 0);
});
