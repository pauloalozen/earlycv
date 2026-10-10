// Testes REAIS de banco (Postgres local) do backfill de indexacao: a
// elegibilidade, o status e a listagem paginada sao resolvidos no banco, sem
// carregar todas as vagas. Os totais de getStatus sao globais, entao o banco
// de teste nao pode ter outras vagas elegiveis alem das semeadas aqui.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, before, beforeEach, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { GoogleIndexingBackfillService } from "./google-indexing-backfill.service";
import {
  GoogleIndexingQueueService,
  INDEXING_PRIORITY,
} from "./google-indexing-queue.service";
import { GoogleIndexingQueueWorker } from "./google-indexing-queue.worker";

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
  // Padrão: vaga do Brasil comum (a ingestão sempre grava country).
  country?: string | null;
  employmentType?: string | null;
};

async function addJob(opts: JobOpts) {
  seq += 1;
  const job = await prisma.job.create({
    data: {
      canonicalKey: `${tag}-ck-${seq}`,
      companyId,
      country: opts.country === undefined ? "Brasil" : opts.country,
      descriptionClean: "d",
      employmentType: opts.employmentType ?? null,
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
    data: {
      dominantArea: "DATA_AI",
      enrichmentStatus: opts.enrichment ?? "COMPLETED",
      jobId: job.id,
    },
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

// Espelha GoogleIndexingService.send: sempre grava um log, nunca lança.
function makeIndexingStub(
  outcomes: Record<string, "SUCCESS" | "ERROR" | "QUOTA"> = {},
) {
  return {
    isEnabled: () => true,
    send: async (input: {
      slug: string;
      url: string;
      type: "URL_UPDATED" | "URL_DELETED";
    }) => {
      const outcome = outcomes[input.slug.replace(`${tag}-`, "")] ?? "SUCCESS";
      await prisma.googleIndexingLog.create({
        data: {
          slug: input.slug,
          status: outcome === "SUCCESS" ? "SUCCESS" : "ERROR",
          type: input.type,
          url: input.url,
        },
      });
      return {
        error: outcome === "SUCCESS" ? null : `falha ${outcome}`,
        ok: outcome === "SUCCESS",
        quotaExceeded: outcome === "QUOTA",
      };
    },
  };
}

// Backfill (só enfileira) + fila + worker de verdade sobre o banco; só o
// envio para o Google é o stub acima.
function makeService(outcomes?: Record<string, "SUCCESS" | "ERROR" | "QUOTA">) {
  const indexing = makeIndexingStub(outcomes);
  const queue = new GoogleIndexingQueueService(
    database as never,
    indexing as never,
  );
  const worker = new GoogleIndexingQueueWorker(
    database as never,
    indexing as never,
    new IngestionLockRepository(database),
  );
  const backfill = new GoogleIndexingBackfillService(database as never, queue);
  return Object.assign(backfill, { queue, worker });
}

function queueItems() {
  return prisma.googleIndexingQueueItem.findMany({
    orderBy: { createdAt: "asc" },
    where: { slug: { startsWith: tag } },
  });
}

async function cleanup() {
  await prisma.googleIndexingLog.deleteMany({
    where: { slug: { startsWith: tag } },
  });
  await prisma.googleIndexingQueueItem.deleteMany({
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

  test("runBackfillBatch só enfileira, até a cota diária, mais recentes primeiro", async () => {
    process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT = "2";
    await addJob({ slug: "old", firstSeenAt: new Date("2026-01-01") });
    await addJob({ slug: "mid", firstSeenAt: new Date("2026-02-01") });
    await addJob({ slug: "new", firstSeenAt: new Date("2026-03-01") });
    const service = makeService();

    const result = await service.runBackfillBatch();

    assert.equal(result.dailyLimit, 2);
    assert.equal(result.enqueued, 2);
    const items = await queueItems();
    assert.deepEqual(items.map((i) => i.slug).sort(), [
      slugOf("mid"),
      slugOf("new"),
    ]);
    assert.ok(items.every((i) => i.priority === INDEXING_PRIORITY.backfill));
    assert.ok(items.every((i) => i.url.endsWith(`/radar/${i.slug}`)));
    // Nada foi enviado ainda: o envio é do worker.
    assert.equal(
      await prisma.googleIndexingLog.count({
        where: { slug: { startsWith: tag } },
      }),
      0,
    );
  });

  test("worker envia até a cota do dia e grava a URL no log", async () => {
    process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT = "3";
    await addJob({ slug: "a", firstSeenAt: new Date("2026-01-01") });
    await addJob({ slug: "b", firstSeenAt: new Date("2026-01-02") });
    await addJob({ slug: "c", firstSeenAt: new Date("2026-01-03") });
    const service = makeService();
    await service.runBackfillBatch();

    process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT = "2";
    const first = await service.worker.runOnce();
    assert.equal(first.sent, 2);
    const second = await service.worker.runOnce();
    assert.equal(second.sent, 0);

    const logs = await prisma.googleIndexingLog.findMany({
      where: { slug: { startsWith: tag } },
    });
    assert.equal(logs.length, 2);
    assert.ok(logs.every((l) => l.url?.endsWith(`/radar/${l.slug}`)));
    assert.equal(
      (await queueItems()).filter((i) => i.status === "pending").length,
      1,
    );
  });

  test("erro conta tentativa e reagenda; cota estourada para a execução sem contar tentativa", async () => {
    await addJob({ slug: "vaga-a", firstSeenAt: new Date("2026-03-01") });
    await addJob({ slug: "vaga-b", firstSeenAt: new Date("2026-02-01") });
    await addJob({ slug: "vaga-c", firstSeenAt: new Date("2026-01-01") });
    const service = makeService({ "vaga-a": "ERROR", "vaga-b": "QUOTA" });
    await service.runBackfillBatch();

    const result = await service.worker.runOnce();

    // vaga-a falha (1 tentativa, reagendada), vaga-b estoura a cota e
    // interrompe: vaga-c nem é tentada.
    assert.equal(result.sent, 0);
    assert.equal(result.quotaExceeded, true);
    const bySlug = new Map((await queueItems()).map((i) => [i.slug, i]));
    const a = bySlug.get(slugOf("vaga-a"));
    assert.equal(a?.attempts, 1);
    assert.equal(a?.status, "pending");
    assert.ok((a?.nextAttemptAt.getTime() ?? 0) > Date.now());
    assert.equal(bySlug.get(slugOf("vaga-b"))?.attempts, 0);
    assert.equal(bySlug.get(slugOf("vaga-c"))?.attempts, 0);
  });

  test("remoção sai antes de publicação; status mudado vira skipped sem gastar cota", async () => {
    process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT = "1";
    await addJob({ slug: "ativa" });
    await addJob({ slug: "fechada", status: "inactive" });
    await addJob({ slug: "fechou-depois" });
    const service = makeService();
    await service.queue.enqueue([
      {
        priority: INDEXING_PRIORITY.newJob,
        slug: slugOf("ativa"),
        type: "URL_UPDATED",
      },
      {
        priority: INDEXING_PRIORITY.deleted,
        slug: slugOf("fechada"),
        type: "URL_DELETED",
      },
      {
        priority: INDEXING_PRIORITY.newJob,
        slug: slugOf("fechou-depois"),
        type: "URL_UPDATED",
      },
    ]);
    await prisma.job.updateMany({
      data: { status: "inactive" },
      where: { slug: slugOf("fechou-depois") },
    });

    // Cota de 1: vai a remoção.
    const first = await service.worker.runOnce();
    assert.equal(first.sent, 1);
    const sent = await prisma.googleIndexingLog.findFirst({
      where: { slug: { startsWith: tag } },
    });
    assert.equal(sent?.slug, slugOf("fechada"));
    assert.equal(sent?.type, "URL_DELETED");

    // Cota esgotada: nada mais é tentado, nem descartado.
    const second = await service.worker.runOnce();
    assert.equal(second.sent + second.skipped, 0);

    process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT = "5";
    const third = await service.worker.runOnce();
    assert.equal(third.sent, 1);
    assert.equal(third.skipped, 1);
    const skipped = (await queueItems()).find(
      (i) => i.slug === slugOf("fechou-depois"),
    );
    assert.equal(skipped?.status, "skipped");
    assert.equal(skipped?.pendingKey, null);
  });

  test("uma pendência por vaga: tipo novo substitui o anterior; mesmo tipo só sobe a prioridade", async () => {
    await addJob({ slug: "vaga" });
    const service = makeService();
    const slug = slugOf("vaga");

    await service.queue.enqueue([
      { priority: INDEXING_PRIORITY.backfill, slug, type: "URL_UPDATED" },
    ]);
    await service.queue.enqueue([
      { priority: INDEXING_PRIORITY.newJob, slug, type: "URL_UPDATED" },
    ]);
    let items = await queueItems();
    assert.equal(items.length, 1);
    assert.equal(items[0]?.priority, INDEXING_PRIORITY.newJob);

    await service.queue.enqueue([
      { priority: INDEXING_PRIORITY.deleted, slug, type: "URL_DELETED" },
    ]);
    items = await queueItems();
    assert.equal(items.length, 1);
    assert.equal(items[0]?.type, "URL_DELETED");
    assert.equal(items[0]?.priority, INDEXING_PRIORITY.deleted);
  });

  test("uses the default daily limit of 200 when env var is unset", async () => {
    const status = await makeService().getStatus();
    assert.equal(status.dailyLimit, 200);
  });

  test("runBackfillBatch não enfileira de novo quem já está na fila", async () => {
    await addJob({ slug: "a", firstSeenAt: new Date("2026-01-01") });
    await addJob({ slug: "b", firstSeenAt: new Date("2026-01-02") });
    const service = makeService();

    const first = await service.runBackfillBatch();
    assert.equal(first.enqueued, 2);

    const second = await service.runBackfillBatch();
    assert.equal(second.enqueued, 0);
    assert.equal((await queueItems()).length, 2);
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
    assert.equal(result.enqueued, 1);
    const sent = await service.worker.runOnce();
    assert.equal(sent.sent, 1);
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

  test("URL_UPDATED só entra na fila para vaga com JobPosting (shouldEmitJobPosting)", async () => {
    await addJob({ slug: "comum" });
    await addJob({ employmentType: "talent_pool", slug: "banco" });
    await addJob({ country: null, slug: "sem-local" });
    const service = makeService();

    const enqueued = await service.queue.enqueue(
      ["comum", "banco", "sem-local"].map((slug) => ({
        priority: INDEXING_PRIORITY.newJob,
        slug: slugOf(slug),
        type: "URL_UPDATED" as const,
      })),
    );

    assert.equal(enqueued, 1);
    assert.deepEqual(
      (await queueItems()).map((item) => item.slug),
      [slugOf("comum")],
    );
  });

  test("URL_DELETED segue igual para banco de talentos e vaga sem localização", async () => {
    await addJob({
      employmentType: "talent_pool",
      slug: "banco",
      status: "inactive",
    });
    await addJob({ country: null, slug: "sem-local", status: "inactive" });
    const service = makeService();

    const enqueued = await service.queue.enqueue(
      ["banco", "sem-local"].map((slug) => ({
        priority: INDEXING_PRIORITY.deleted,
        slug: slugOf(slug),
        type: "URL_DELETED" as const,
      })),
    );

    assert.equal(enqueued, 2);
  });

  test("worker marca skipped a pendência de vaga que perdeu o JobPosting depois do enfileiramento", async () => {
    const talentPool = await addJob({ slug: "virou-banco" });
    const noLocation = await addJob({ slug: "perdeu-local" });
    await addJob({ slug: "segue-comum" });
    const service = makeService();
    await service.queue.enqueue(
      ["virou-banco", "perdeu-local", "segue-comum"].map((slug) => ({
        priority: INDEXING_PRIORITY.newJob,
        slug: slugOf(slug),
        type: "URL_UPDATED" as const,
      })),
    );
    await prisma.job.update({
      data: { employmentType: "talent_pool" },
      where: { id: talentPool.id },
    });
    await prisma.job.update({
      data: { country: null },
      where: { id: noLocation.id },
    });

    const result = await service.worker.runOnce();

    assert.equal(result.sent, 1);
    assert.equal(result.skipped, 2);
    const bySlug = new Map((await queueItems()).map((i) => [i.slug, i.status]));
    assert.equal(bySlug.get(slugOf("virou-banco")), "skipped");
    assert.equal(bySlug.get(slugOf("perdeu-local")), "skipped");
    assert.equal(bySlug.get(slugOf("segue-comum")), "done");
  });

  test("backfill pula vaga sem JobPosting e completa o lote com as seguintes", async () => {
    process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT = "2";
    await addJob({
      firstSeenAt: new Date("2026-03-03"),
      employmentType: "talent_pool",
      slug: "banco",
    });
    await addJob({
      country: null,
      firstSeenAt: new Date("2026-03-02"),
      slug: "sem-local",
    });
    await addJob({ firstSeenAt: new Date("2026-03-01"), slug: "a" });
    await addJob({ firstSeenAt: new Date("2026-02-01"), slug: "b" });
    const service = makeService();

    const result = await service.runBackfillBatch();

    assert.equal(result.enqueued, 2);
    assert.deepEqual((await queueItems()).map((i) => i.slug).sort(), [
      slugOf("a"),
      slugOf("b"),
    ]);
  });
});
