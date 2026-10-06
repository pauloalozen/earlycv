// Testes REAIS de banco (Postgres local) do backfill de indexacao: a
// elegibilidade, o status e a listagem paginada sao resolvidos no banco, sem
// carregar todas as vagas. Os totais de getStatus sao globais, entao o banco
// de teste nao pode ter outras vagas elegiveis alem das semeadas aqui.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, before, beforeEach, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { GoogleIndexingBackfillService } from "./google-indexing-backfill.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const tag = `gib-${randomUUID().slice(0, 8)}`;

let companyId = "";
let seq = 0;

type JobOpts = {
  slug: string | null;
  status?: "active" | "inactive";
  enrichment?: "COMPLETED" | "PENDING";
  firstSeenAt?: Date;
};

async function addJob(opts: JobOpts) {
  seq += 1;
  const job = await prisma.job.create({
    data: {
      canonicalKey: `${tag}-ck-${seq}`,
      companyId,
      descriptionClean: "d",
      descriptionRaw: "d",
      firstSeenAt: opts.firstSeenAt ?? new Date(),
      lastSeenAt: new Date(),
      locationText: "Remoto",
      normalizedTitle: "vaga",
      slug: opts.slug === null ? null : `${tag}-${opts.slug}`,
      sourceJobUrl: `https://example.com/${tag}/${seq}`,
      status: opts.status ?? "active",
      title: "Vaga",
    },
  });
  await prisma.jobEnrichment.create({
    data: { enrichmentStatus: opts.enrichment ?? "COMPLETED", jobId: job.id },
  });
  return job;
}

const slugOf = (s: string) => `${tag}-${s}`;

async function addLog(
  slug: string,
  status: "SUCCESS" | "ERROR",
  errorMsg?: string,
) {
  await prisma.googleIndexingLog.create({
    data: { errorMsg, slug: slugOf(slug), status, type: "URL_UPDATED" },
  });
}

// Espelha GoogleIndexingService.notify: sempre grava um log, nunca lanca.
function makeIndexingStub(
  outcomes: Record<string, "SUCCESS" | "ERROR" | "QUOTA"> = {},
) {
  return {
    notifyIndexing: async (slug: string) => {
      const outcome = outcomes[slug.replace(`${tag}-`, "")] ?? "SUCCESS";
      await prisma.googleIndexingLog.create({
        data: {
          slug,
          status: outcome === "SUCCESS" ? "SUCCESS" : "ERROR",
          type: "URL_UPDATED",
        },
      });
      return { ok: outcome === "SUCCESS", quotaExceeded: outcome === "QUOTA" };
    },
  };
}

function makeService(outcomes?: Record<string, "SUCCESS" | "ERROR" | "QUOTA">) {
  return new GoogleIndexingBackfillService(
    database as never,
    makeIndexingStub(outcomes) as never,
  );
}

async function cleanup() {
  await prisma.googleIndexingLog.deleteMany({
    where: { slug: { startsWith: tag } },
  });
  await prisma.job.deleteMany({ where: { companyId } });
}

describe("GoogleIndexingBackfillService (banco real)", () => {
  const previousLimit = process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT;

  before(async () => {
    const company = await prisma.company.create({
      data: { name: tag, normalizedName: tag },
    });
    companyId = company.id;
  });

  beforeEach(async () => {
    delete process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT;
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
    if (previousLimit === undefined) {
      delete process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT;
    } else {
      process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT = previousLimit;
    }
  });

  test("getStatus ignores jobs without slug, inactive, or unenriched", async () => {
    await addJob({ slug: "vaga-a" });
    await addJob({ slug: "vaga-b", status: "inactive" });
    await addJob({ slug: "vaga-c", enrichment: "PENDING" });
    await addJob({ slug: null });

    const status = await makeService().getStatus();

    assert.equal(status.totalEligible, 1);
    assert.equal(status.pending, 1);
    assert.equal(status.notified, 0);
  });

  test("getStatus excludes slugs already notified with success", async () => {
    await addJob({ slug: "vaga-a" });
    await addJob({ slug: "vaga-b" });
    await addLog("vaga-a", "SUCCESS");

    const status = await makeService().getStatus();

    assert.equal(status.totalEligible, 2);
    assert.equal(status.notified, 1);
    assert.equal(status.pending, 1);
  });

  test("runBackfillBatch respects the daily limit, prioritizing most recent jobs", async () => {
    process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT = "2";
    await addJob({ slug: "old", firstSeenAt: new Date("2026-01-01") });
    await addJob({ slug: "mid", firstSeenAt: new Date("2026-02-01") });
    await addJob({ slug: "new", firstSeenAt: new Date("2026-03-01") });
    const service = makeService();

    const result = await service.runBackfillBatch();

    assert.equal(result.dailyLimit, 2);
    assert.equal(result.processed, 2);
    assert.equal(result.succeeded, 2);
    assert.equal(result.failed, 0);
    const done = await prisma.googleIndexingLog.findMany({
      where: { slug: { startsWith: tag } },
      select: { slug: true },
    });
    assert.deepEqual(done.map((l) => l.slug).sort(), [
      slugOf("mid"),
      slugOf("new"),
    ]);
    assert.equal((await service.getStatus()).pending, 1);
  });

  test("runBackfillBatch counts failures without throwing", async () => {
    await addJob({ slug: "vaga-a" });
    await addJob({ slug: "vaga-b" });

    const result = await makeService({
      "vaga-b": "ERROR",
    }).runBackfillBatch();

    assert.equal(result.processed, 2);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 1);
  });

  test("runBackfillBatch para o lote assim que a cota diaria do Google estoura", async () => {
    await addJob({ slug: "vaga-a", firstSeenAt: new Date("2026-03-01") });
    await addJob({ slug: "vaga-b", firstSeenAt: new Date("2026-02-01") });
    await addJob({ slug: "vaga-c", firstSeenAt: new Date("2026-01-01") });

    const result = await makeService({ "vaga-b": "QUOTA" }).runBackfillBatch();

    // vaga-a (mais recente) tem sucesso, vaga-b estoura a cota e interrompe
    // o lote — vaga-c nunca chega a ser tentada.
    assert.equal(result.processed, 2);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 1);
  });

  test("uses the default daily limit of 200 when env var is unset", async () => {
    const status = await makeService().getStatus();
    assert.equal(status.dailyLimit, 200);
  });

  test("runBackfillBatch caps the batch by what was already notified today, across runs", async () => {
    process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT = "2";
    await addJob({ slug: "a", firstSeenAt: new Date("2026-01-01") });
    await addJob({ slug: "b", firstSeenAt: new Date("2026-01-02") });
    await addJob({ slug: "c", firstSeenAt: new Date("2026-01-03") });
    const service = makeService();

    const first = await service.runBackfillBatch();
    assert.equal(first.processed, 2);

    const second = await service.runBackfillBatch();
    assert.equal(second.notifiedToday, 2);
    assert.equal(second.processed, 0);
  });

  test("listJobsByIndexingStatus separates pending, notified (SUCCESS) and failed (latest ERROR)", async () => {
    await addJob({ slug: "vaga-pending" });
    await addJob({ slug: "vaga-notified" });
    await addJob({ slug: "vaga-failed" });
    await addLog("vaga-notified", "SUCCESS");
    await addLog("vaga-failed", "ERROR", "quota exceeded");
    const service = makeService();
    const list = (status: "pending" | "notified" | "failed") =>
      service.listJobsByIndexingStatus({ page: 1, pageSize: 20, status });

    const pending = await list("pending");
    const notified = await list("notified");
    const failed = await list("failed");

    assert.deepEqual(
      pending.jobs.map((j) => j.slug),
      [slugOf("vaga-pending")],
    );
    assert.deepEqual(
      notified.jobs.map((j) => j.slug),
      [slugOf("vaga-notified")],
    );
    assert.equal(failed.jobs[0]?.slug, slugOf("vaga-failed"));
    assert.equal(failed.jobs[0]?.lastError, "quota exceeded");
    assert.equal(failed.jobs[0]?.lastAttemptStatus, "ERROR");
  });

  test("a latest SUCCESS after an old ERROR is notified, not failed", async () => {
    await addJob({ slug: "retry" });
    await prisma.googleIndexingLog.create({
      data: {
        createdAt: new Date("2026-01-01"),
        errorMsg: "x",
        slug: slugOf("retry"),
        status: "ERROR",
        type: "URL_UPDATED",
      },
    });
    await addLog("retry", "SUCCESS");
    const service = makeService();

    const failed = await service.listJobsByIndexingStatus({
      page: 1,
      pageSize: 20,
      status: "failed",
    });
    const notified = await service.listJobsByIndexingStatus({
      page: 1,
      pageSize: 20,
      status: "notified",
    });

    assert.equal(failed.total, 0);
    assert.equal(notified.total, 1);
  });

  test("vaga reativada depois de um URL_DELETED volta pra fila e é re-notificada", async () => {
    const log = (
      slug: string,
      type: "URL_UPDATED" | "URL_DELETED",
      status: "SUCCESS" | "ERROR",
      createdAt: string,
    ) =>
      prisma.googleIndexingLog.create({
        data: {
          createdAt: new Date(createdAt),
          slug: slugOf(slug),
          status,
          type,
        },
      });
    // Notificada, removida e reativada: o URL_UPDATED antigo não vale mais.
    await addJob({ slug: "reativada", firstSeenAt: new Date("2026-03-01") });
    await log("reativada", "URL_UPDATED", "SUCCESS", "2026-08-01");
    await log("reativada", "URL_DELETED", "SUCCESS", "2026-08-10");
    // Removida e já re-notificada depois: segue notificada.
    await addJob({ slug: "renotificada", firstSeenAt: new Date("2026-02-01") });
    await log("renotificada", "URL_UPDATED", "SUCCESS", "2026-08-01");
    await log("renotificada", "URL_DELETED", "SUCCESS", "2026-08-10");
    await log("renotificada", "URL_UPDATED", "SUCCESS", "2026-08-20");
    // Remoção que falhou não invalida a notificação.
    await addJob({
      slug: "remocao-falhou",
      firstSeenAt: new Date("2026-01-01"),
    });
    await log("remocao-falhou", "URL_UPDATED", "SUCCESS", "2026-08-01");
    await log("remocao-falhou", "URL_DELETED", "ERROR", "2026-08-10");
    const service = makeService();

    const status = await service.getStatus();
    assert.equal(status.totalEligible, 3);
    assert.equal(status.notified, 2);
    assert.equal(status.pending, 1);

    const pending = await service.listJobsByIndexingStatus({
      page: 1,
      pageSize: 20,
      status: "pending",
    });
    assert.deepEqual(
      pending.jobs.map((j) => j.slug),
      [slugOf("reativada")],
    );
    assert.equal(pending.jobs[0]?.lastAttemptAt, null);

    const result = await service.runBackfillBatch();
    assert.equal(result.processed, 1);
    assert.equal(result.succeeded, 1);
    assert.equal((await service.getStatus()).pending, 0);
  });

  test("listJobsByIndexingStatus paginates within the filtered bucket, in the database", async () => {
    for (let i = 0; i < 5; i++) {
      await addJob({
        slug: `vaga-${i}`,
        firstSeenAt: new Date(2026, 0, i + 1),
      });
    }
    const service = makeService();
    const page = (n: number) =>
      service.listJobsByIndexingStatus({
        page: n,
        pageSize: 2,
        status: "pending",
      });

    const [page1, page2, page3, page4] = [
      await page(1),
      await page(2),
      await page(3),
      await page(4),
    ];

    assert.equal(page1.total, 5);
    assert.deepEqual(
      [page1, page2, page3].map((p) => p.jobs.length),
      [2, 2, 1],
    );
    assert.equal(page4.jobs.length, 0);
    assert.equal(page4.total, 5);
    assert.deepEqual(
      [...page1.jobs, ...page2.jobs, ...page3.jobs].map((j) => j.slug),
      [4, 3, 2, 1, 0].map((i) => slugOf(`vaga-${i}`)),
    );
  });
});
