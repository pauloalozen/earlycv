import assert from "node:assert/strict";
import { test } from "node:test";

import type { IngestionJob, IngestionJobRun } from "@prisma/client";
import type { DatabaseService } from "../database/database.service";
import type { CreateIngestionJobDto } from "./dto/create-ingestion-job.dto";
import { IngestionJobService } from "./ingestion-job.service";
import type { IngestionJobDispatchService } from "./ingestion-job-dispatch.service";

type FixtureJobRun = {
  id: string;
  jobId: string | null;
  batchRunId?: string | null;
  status: string;
  triggeredBy?: string;
  finishedAt: Date | null;
  batchRun: {
    status: string;
    cancelRequestedAt?: Date | null;
    finishedAt?: Date | null;
    updatedAt?: Date;
  } | null;
  job: { id: string; jobType: string; name: string } | null;
};

function matchesRunWhere(
  run: FixtureJobRun,
  where?: { triggeredBy?: string; jobId?: string },
) {
  if (
    where?.triggeredBy !== undefined &&
    run.triggeredBy !== where.triggeredBy
  ) {
    return false;
  }
  if (where?.jobId !== undefined && run.jobId !== where.jobId) {
    return false;
  }
  return true;
}

function createFixture(
  seed: IngestionJob[] = [],
  jobRunSeed: FixtureJobRun[] = [],
) {
  const jobs = new Map(seed.map((job) => [job.id, job]));
  const jobRuns = new Map(jobRunSeed.map((run) => [run.id, run]));
  const jobSources = new Map<
    string,
    { id: string; sourceName: string; company: { name: string } }
  >([
    [
      "source-1",
      { company: { name: "ACME" }, id: "source-1", sourceName: "ACME Careers" },
    ],
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
      findFirst: async ({
        where,
      }: {
        where: {
          jobSourceId: string;
          scheduleType: string;
          scopeType: string;
        };
      }) =>
        Array.from(jobs.values()).find(
          (job) =>
            job.jobSourceId === where.jobSourceId &&
            job.scheduleType === where.scheduleType &&
            job.scopeType === where.scopeType,
        ) ?? null,
      findMany: async ({ where }: { where?: { isAdHoc?: boolean } } = {}) =>
        Array.from(jobs.values()).filter((job) =>
          where?.isAdHoc === undefined
            ? true
            : Boolean((job as { isAdHoc?: boolean }).isAdHoc) === where.isAdHoc,
        ),
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
    ingestionBatchRun: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        for (const run of jobRuns.values()) {
          if (run.batchRunId === where.id && run.batchRun) {
            Object.assign(run.batchRun, data);
          }
        }
        return { id: where.id, ...data };
      },
    },
    ingestionJobRun: {
      count: async ({
        where,
      }: {
        where?: { triggeredBy?: string; jobId?: string };
      } = {}) =>
        Array.from(jobRuns.values()).filter((run) =>
          matchesRunWhere(run, where),
        ).length,
      findMany: async ({
        where,
      }: {
        where?: { triggeredBy?: string; jobId?: string };
      } = {}) =>
        Array.from(jobRuns.values()).filter((run) =>
          matchesRunWhere(run, where),
        ),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FixtureJobRun>;
      }) => {
        const existing = jobRuns.get(where.id);
        if (!existing) throw new Error("not found");
        const updated = { ...existing, ...data };
        jobRuns.set(where.id, updated);
        return updated;
      },
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

  return { dispatchCalls, jobRuns, jobs, service };
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

test("listRuns reconcilia status RUNNING travado usando o status real do batchRun", async () => {
  const { service, jobRuns } = createFixture(
    [],
    [
      {
        batchRun: { status: "completed" },
        finishedAt: null,
        id: "run-1",
        job: { id: "job-1", jobType: "CRAWL", name: "Gupy" },
        jobId: "job-1",
        status: "RUNNING",
      },
    ],
  );

  const result = await service.listRuns();

  assert.equal(result.runs[0]?.status, "COMPLETED");
  assert.ok(result.runs[0]?.finishedAt instanceof Date);
  // reconciliacao deve persistir, nao so refletir na resposta
  assert.equal(jobRuns.get("run-1")?.status, "COMPLETED");
});

test("listRuns reconcilia usando o finishedAt real do batchRun, nao o horario da leitura", async () => {
  const realFinishedAt = new Date("2026-08-15T03:27:06.140Z");
  const { service, jobRuns } = createFixture(
    [],
    [
      {
        batchRun: { finishedAt: realFinishedAt, status: "failed" },
        finishedAt: null,
        id: "run-1",
        job: { id: "job-1", jobType: "CRAWL", name: "Gupy" },
        jobId: "job-1",
        status: "RUNNING",
      },
    ],
  );

  const result = await service.listRuns();

  assert.equal(result.runs[0]?.status, "FAILED");
  assert.equal(result.runs[0]?.finishedAt?.getTime(), realFinishedAt.getTime());
  assert.equal(
    jobRuns.get("run-1")?.finishedAt?.getTime(),
    realFinishedAt.getTime(),
  );
});

test("listRuns nao mexe em runs sem batchRun ou ja em status terminal", async () => {
  const { service } = createFixture(
    [],
    [
      {
        batchRun: null,
        finishedAt: null,
        id: "run-enrichment",
        job: { id: "job-2", jobType: "ENRICHMENT", name: "Enriquecimento" },
        jobId: "job-2",
        status: "COMPLETED",
      },
      {
        // updatedAt recente — ainda esta genuinamente ativo, nao deve
        // ser tratado como abandonado.
        batchRun: { status: "running", updatedAt: new Date() },
        finishedAt: null,
        id: "run-still-running",
        job: { id: "job-1", jobType: "CRAWL", name: "Gupy" },
        jobId: "job-1",
        status: "RUNNING",
      },
    ],
  );

  const result = await service.listRuns();

  const enrichment = result.runs.find((r) => r.id === "run-enrichment");
  const stillRunning = result.runs.find((r) => r.id === "run-still-running");
  assert.equal(enrichment?.status, "COMPLETED");
  assert.equal(stillRunning?.status, "RUNNING");
});

test("listRuns marca como abandonado um batch preso sem nenhuma atividade recente", async () => {
  const { service, jobRuns } = createFixture(
    [],
    [
      {
        batchRunId: "batch-abandoned",
        // sem atividade ha muito mais que STALE_BATCH_THRESHOLD_MS — o
        // processo que rodava provavelmente morreu (deploy, restart).
        batchRun: {
          cancelRequestedAt: null,
          status: "running",
          updatedAt: new Date(Date.now() - 60 * 60_000),
        },
        finishedAt: null,
        id: "run-abandoned",
        job: { id: "job-1", jobType: "CRAWL", name: "Gupy" },
        jobId: "job-1",
        status: "RUNNING",
      },
    ],
  );

  const result = await service.listRuns();

  assert.equal(result.runs[0]?.status, "FAILED");
  assert.ok(result.runs[0]?.finishedAt instanceof Date);
  assert.equal(jobRuns.get("run-abandoned")?.status, "FAILED");
});

test("listRuns marca abandonado como CANCELLED quando cancelamento ja tinha sido pedido", async () => {
  const { service } = createFixture(
    [],
    [
      {
        batchRunId: "batch-abandoned-cancel",
        batchRun: {
          cancelRequestedAt: new Date(Date.now() - 30 * 60_000),
          status: "cancelling",
          updatedAt: new Date(Date.now() - 60 * 60_000),
        },
        finishedAt: null,
        id: "run-abandoned-cancel",
        job: { id: "job-1", jobType: "CRAWL", name: "Gupy" },
        jobId: "job-1",
        status: "RUNNING",
      },
    ],
  );

  const result = await service.listRuns();

  assert.equal(result.runs[0]?.status, "CANCELLED");
});

test("runSourceAdHoc cria um job MANUAL isAdHoc na primeira chamada e reaproveita nas seguintes", async () => {
  const { service, jobs, dispatchCalls } = createFixture();

  await service.runSourceAdHoc("source-1");
  assert.equal(jobs.size, 1);
  const created = Array.from(jobs.values())[0] as IngestionJob & {
    isAdHoc?: boolean;
  };
  assert.equal(created?.scheduleType, "MANUAL");
  assert.equal(created?.scopeType, "SOURCE");
  assert.equal(created?.jobSourceId, "source-1");
  assert.equal(created?.name, "ACME · ACME Careers");
  assert.equal(created?.isAdHoc, true);

  await service.runSourceAdHoc("source-1");
  assert.equal(jobs.size, 1, "nao deve criar um segundo job pra mesma fonte");
  assert.equal(dispatchCalls.length, 2);
  assert.ok(dispatchCalls.every((call) => call.trigger === "MANUAL"));
});

test("findAll esconde jobs isAdHoc, so mostra os criados pelo popup Criar job", async () => {
  const { service, jobs } = createFixture();

  await service.create(baseDto({ name: "Job explícito" }));
  await service.runSourceAdHoc("source-1");
  assert.equal(jobs.size, 2, "os 2 jobs existem de verdade no banco");

  const visible = await service.findAll();

  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.name, "Job explícito");
});

test("listRuns filtra por triggeredBy", async () => {
  const { service } = createFixture(
    [],
    [
      {
        batchRun: null,
        finishedAt: new Date(),
        id: "run-scheduled",
        job: { id: "job-1", jobType: "CRAWL", name: "Gupy" },
        jobId: "job-1",
        status: "COMPLETED",
        triggeredBy: "SCHEDULE",
      },
      {
        batchRun: null,
        finishedAt: new Date(),
        id: "run-manual",
        job: { id: "job-1", jobType: "CRAWL", name: "Gupy" },
        jobId: "job-1",
        status: "COMPLETED",
        triggeredBy: "MANUAL",
      },
    ],
  );

  const result = await service.listRuns({ triggeredBy: "MANUAL" } as never);

  assert.equal(result.runs.length, 1);
  assert.equal(result.runs[0]?.id, "run-manual");
});

test("runSourceAdHoc nao reaproveita um job com agendamento real da mesma fonte", async () => {
  const scheduledJob = {
    adapterType: null,
    createdAt: new Date(),
    description: null,
    id: "job-scheduled",
    isEnabled: true,
    jobSourceId: "source-1",
    jobType: "CRAWL",
    lastRunAt: null,
    name: "Diario ACME",
    nextRunAt: new Date(),
    scheduleDaysOfWeek: [],
    scheduleHour: 7,
    scheduleInterval: null,
    scheduleMinute: 0,
    scheduleType: "DAILY",
    scopeType: "SOURCE",
    updatedAt: new Date(),
  } as IngestionJob;

  const { service, jobs } = createFixture([scheduledJob]);

  await service.runSourceAdHoc("source-1");

  assert.equal(jobs.size, 2, "deve criar um job MANUAL separado do agendado");
});

test("remove apaga o job", async () => {
  const { service, jobs } = createFixture();
  const created = await service.create(baseDto());

  await service.remove(created.id);

  assert.equal(jobs.has(created.id), false);
});
