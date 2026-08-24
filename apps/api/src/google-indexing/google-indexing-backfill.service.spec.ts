import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { GoogleIndexingBackfillService } from "./google-indexing-backfill.service";

type JobFixture = {
  id: string;
  slug: string | null;
  title: string;
  companyName: string;
  status: string;
  firstSeenAt: Date;
  enrichmentStatus: string | null;
};

type LogRow = {
  slug: string;
  type: string;
  status: string;
  createdAt: Date;
  errorMsg?: string | null;
};

function createFixture() {
  const jobs: JobFixture[] = [];
  const logs: LogRow[] = [];

  const database = {
    job: {
      findMany: async () =>
        jobs
          .filter(
            (job) =>
              job.slug !== null &&
              job.status === "active" &&
              job.enrichmentStatus === "COMPLETED",
          )
          .sort((a, b) => b.firstSeenAt.getTime() - a.firstSeenAt.getTime())
          .map((job) => ({
            id: job.id,
            slug: job.slug,
            title: job.title,
            firstSeenAt: job.firstSeenAt,
            company: { name: job.companyName },
          })),
    },
    googleIndexingLog: {
      findMany: async ({
        where,
      }: {
        where: {
          slug: { in: string[] };
          type: string;
          status?: string;
        };
      }) =>
        logs
          .filter(
            (log) =>
              where.slug.in.includes(log.slug) &&
              log.type === where.type &&
              (!where.status || log.status === where.status),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      count: async ({
        where,
      }: {
        where: {
          slug?: { in: string[] };
          type: string;
          status: string;
          createdAt?: { gte: Date };
        };
      }) =>
        logs.filter(
          (log) =>
            (!where.slug || where.slug.in.includes(log.slug)) &&
            log.type === where.type &&
            log.status === where.status &&
            (!where.createdAt || log.createdAt >= where.createdAt.gte),
        ).length,
    },
    ingestionJob: {
      findFirst: async () => ({ id: "seed-google-indexing-backfill-job" }),
    },
  };

  // Espelha o comportamento real de GoogleIndexingService.notify: sempre
  // grava um GoogleIndexingLog, sucesso ou erro, nunca lança.
  const notifyOutcomes = new Map<string, "SUCCESS" | "ERROR">();
  const googleIndexingService = {
    notifyIndexing: async (slug: string) => {
      logs.push({
        slug,
        type: "URL_UPDATED",
        status: notifyOutcomes.get(slug) ?? "SUCCESS",
        createdAt: new Date(),
      });
    },
  };

  return { jobs, logs, notifyOutcomes, database, googleIndexingService };
}

let nextJobId = 1;

function addJob(
  jobs: JobFixture[],
  overrides: Partial<JobFixture> & { slug: string },
) {
  jobs.push({
    id: `job-${nextJobId++}`,
    title: "Vaga",
    companyName: "EarlyCV",
    status: "active",
    firstSeenAt: new Date(),
    enrichmentStatus: "COMPLETED",
    ...overrides,
  });
}

describe("GoogleIndexingBackfillService", () => {
  const previousLimit = process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT;

  beforeEach(() => {
    delete process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT;
  });

  afterEach(() => {
    if (previousLimit === undefined) {
      delete process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT;
    } else {
      process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT = previousLimit;
    }
  });

  test("getStatus ignores jobs without slug, inactive, or unenriched", async () => {
    const { jobs, database, googleIndexingService } = createFixture();
    addJob(jobs, { slug: "vaga-a" });
    addJob(jobs, { slug: "vaga-b", status: "inactive" });
    addJob(jobs, { slug: "vaga-c", enrichmentStatus: "PENDING" });
    addJob(jobs, { slug: null as unknown as string });

    const service = new GoogleIndexingBackfillService(
      database as never,
      googleIndexingService as never,
    );

    const status = await service.getStatus();

    assert.equal(status.totalEligible, 1);
    assert.equal(status.pending, 1);
    assert.equal(status.notified, 0);
  });

  test("getStatus excludes slugs already notified with success", async () => {
    const { jobs, logs, database, googleIndexingService } = createFixture();
    addJob(jobs, { slug: "vaga-a" });
    addJob(jobs, { slug: "vaga-b" });
    logs.push({
      slug: "vaga-a",
      type: "URL_UPDATED",
      status: "SUCCESS",
      createdAt: new Date(),
    });

    const service = new GoogleIndexingBackfillService(
      database as never,
      googleIndexingService as never,
    );

    const status = await service.getStatus();

    assert.equal(status.totalEligible, 2);
    assert.equal(status.notified, 1);
    assert.equal(status.pending, 1);
  });

  test("runBackfillBatch respects the daily limit, prioritizing most recent jobs", async () => {
    process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT = "2";
    const { jobs, database, googleIndexingService } = createFixture();
    addJob(jobs, { slug: "old", firstSeenAt: new Date("2026-01-01") });
    addJob(jobs, { slug: "mid", firstSeenAt: new Date("2026-02-01") });
    addJob(jobs, { slug: "new", firstSeenAt: new Date("2026-03-01") });

    const service = new GoogleIndexingBackfillService(
      database as never,
      googleIndexingService as never,
    );

    const result = await service.runBackfillBatch();

    assert.equal(result.dailyLimit, 2);
    assert.equal(result.processed, 2);
    assert.equal(result.succeeded, 2);
    assert.equal(result.failed, 0);

    const status = await service.getStatus();
    assert.equal(status.pending, 1);
  });

  test("runBackfillBatch counts failures without throwing", async () => {
    const { jobs, notifyOutcomes, database, googleIndexingService } =
      createFixture();
    addJob(jobs, { slug: "vaga-a" });
    addJob(jobs, { slug: "vaga-b" });
    notifyOutcomes.set("vaga-b", "ERROR");

    const service = new GoogleIndexingBackfillService(
      database as never,
      googleIndexingService as never,
    );

    const result = await service.runBackfillBatch();

    assert.equal(result.processed, 2);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 1);
  });

  test("uses the default daily limit of 200 when env var is unset", async () => {
    const { database, googleIndexingService } = createFixture();
    const service = new GoogleIndexingBackfillService(
      database as never,
      googleIndexingService as never,
    );

    const status = await service.getStatus();

    assert.equal(status.dailyLimit, 200);
  });

  test("runBackfillBatch caps the batch by what was already notified today, across separate runs", async () => {
    process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT = "2";
    const { jobs, database, googleIndexingService } = createFixture();
    addJob(jobs, { slug: "a", firstSeenAt: new Date("2026-01-01") });
    addJob(jobs, { slug: "b", firstSeenAt: new Date("2026-01-02") });
    addJob(jobs, { slug: "c", firstSeenAt: new Date("2026-01-03") });

    const service = new GoogleIndexingBackfillService(
      database as never,
      googleIndexingService as never,
    );

    const first = await service.runBackfillBatch();
    assert.equal(first.processed, 2);

    // A cota diária (2) já foi usada pela primeira execução — uma segunda
    // execução no mesmo dia (ex.: "Rodar agora" depois do cron das 3h) não
    // pode processar mais nada, mesmo tendo vaga pendente.
    const second = await service.runBackfillBatch();
    assert.equal(second.notifiedToday, 2);
    assert.equal(second.processed, 0);
  });

  test("listJobsByIndexingStatus separates pending (never attempted), notified (SUCCESS), and failed (latest ERROR)", async () => {
    const { jobs, logs, database, googleIndexingService } = createFixture();
    addJob(jobs, { slug: "vaga-pending" });
    addJob(jobs, { slug: "vaga-notified" });
    addJob(jobs, { slug: "vaga-failed" });
    logs.push({
      slug: "vaga-notified",
      type: "URL_UPDATED",
      status: "SUCCESS",
      createdAt: new Date(),
    });
    logs.push({
      slug: "vaga-failed",
      type: "URL_UPDATED",
      status: "ERROR",
      createdAt: new Date(),
      errorMsg: "quota exceeded",
    });

    const service = new GoogleIndexingBackfillService(
      database as never,
      googleIndexingService as never,
    );

    const pending = await service.listJobsByIndexingStatus({
      status: "pending",
      page: 1,
      pageSize: 20,
    });
    const notified = await service.listJobsByIndexingStatus({
      status: "notified",
      page: 1,
      pageSize: 20,
    });
    const failed = await service.listJobsByIndexingStatus({
      status: "failed",
      page: 1,
      pageSize: 20,
    });

    assert.deepEqual(
      pending.jobs.map((j) => j.slug),
      ["vaga-pending"],
    );
    assert.deepEqual(
      notified.jobs.map((j) => j.slug),
      ["vaga-notified"],
    );
    assert.equal(failed.jobs[0]?.slug, "vaga-failed");
    assert.equal(failed.jobs[0]?.lastError, "quota exceeded");
  });

  test("listJobsByIndexingStatus paginates within the filtered bucket", async () => {
    const { jobs, database, googleIndexingService } = createFixture();
    for (let i = 0; i < 5; i++) {
      addJob(jobs, {
        slug: `vaga-${i}`,
        firstSeenAt: new Date(2026, 0, i + 1),
      });
    }

    const service = new GoogleIndexingBackfillService(
      database as never,
      googleIndexingService as never,
    );

    const page1 = await service.listJobsByIndexingStatus({
      status: "pending",
      page: 1,
      pageSize: 2,
    });
    const page2 = await service.listJobsByIndexingStatus({
      status: "pending",
      page: 2,
      pageSize: 2,
    });

    assert.equal(page1.total, 5);
    assert.equal(page1.jobs.length, 2);
    assert.equal(page2.jobs.length, 2);
    assert.notDeepEqual(
      page1.jobs.map((j) => j.slug),
      page2.jobs.map((j) => j.slug),
    );
  });
});
