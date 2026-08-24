import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { GoogleIndexingBackfillService } from "./google-indexing-backfill.service";

type JobFixture = {
  slug: string | null;
  status: string;
  firstSeenAt: Date;
  enrichmentStatus: string | null;
};

type LogRow = {
  slug: string;
  type: string;
  status: string;
  createdAt: Date;
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
          .map((job) => ({ slug: job.slug, firstSeenAt: job.firstSeenAt })),
    },
    googleIndexingLog: {
      findMany: async ({
        where,
      }: {
        where: { slug: { in: string[] }; type: string; status: string };
      }) =>
        logs.filter(
          (log) =>
            where.slug.in.includes(log.slug) &&
            log.type === where.type &&
            log.status === where.status,
        ),
      count: async ({
        where,
      }: {
        where: {
          slug: { in: string[] };
          type: string;
          status: string;
          createdAt?: { gte: Date };
        };
      }) =>
        logs.filter(
          (log) =>
            where.slug.in.includes(log.slug) &&
            log.type === where.type &&
            log.status === where.status &&
            (!where.createdAt || log.createdAt >= where.createdAt.gte),
        ).length,
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

function addJob(
  jobs: JobFixture[],
  overrides: Partial<JobFixture> & { slug: string },
) {
  jobs.push({
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
});
