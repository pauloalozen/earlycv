import assert from "node:assert/strict";
import { test } from "node:test";

import { JobLifecycle } from "./job-lifecycle.service";

type Row = { id: string; slug: string | null; status: string };

function makeFixture(rows: Row[]) {
  const updates: Array<{ ids: string[]; data: Record<string, unknown> }> = [];
  const enqueued: Array<{ slug: string; type: string; priority: number }> = [];
  const revalidated: Array<{ slug: string; reason: string }> = [];
  const database = {
    job: {
      findMany: async ({
        where,
      }: {
        where: { AND: [unknown, { status: { not: string } }] };
      }) => rows.filter((row) => row.status !== where.AND[1].status.not),
      updateMany: async (args: {
        where: { id: { in: string[] } };
        data: Record<string, unknown>;
      }) => {
        updates.push({ data: args.data, ids: args.where.id.in });
        return { count: args.where.id.in.length };
      },
    },
  };
  const queue = {
    enqueue: async (
      items: Array<{ slug: string; type: string; priority: number }>,
    ) => {
      enqueued.push(...items);
      return items.length;
    },
  };
  const web = {
    requestJobRevalidation: (
      slug: string | null | undefined,
      reason: string,
    ) => {
      revalidated.push({ reason, slug: slug ?? "" });
    },
  };
  const lifecycle = new JobLifecycle(database as never, queue, web as never);
  return { database, enqueued, lifecycle, revalidated, updates };
}

test("closeJobs muda o status, enfileira URL_DELETED só de quem estava active e revalida", async () => {
  const { enqueued, lifecycle, revalidated, updates } = makeFixture([
    { id: "1", slug: "ativa", status: "active" },
    { id: "2", slug: "ja-inativa", status: "inactive" },
    { id: "3", slug: null, status: "active" },
    { id: "4", slug: "ja-removida", status: "removed" },
  ]);

  const result = await lifecycle.closeJobs({
    reason: "teste",
    status: "removed",
    where: {},
  });

  assert.equal(result.count, 3);
  assert.deepEqual(updates, [
    { data: { status: "removed" }, ids: ["1", "2", "3"] },
  ]);
  assert.deepEqual(enqueued, [
    { priority: 0, slug: "ativa", type: "URL_DELETED" },
  ]);
  assert.deepEqual(
    revalidated.map((r) => r.slug),
    ["ativa", "ja-inativa"],
  );
});

test("closeJobs com tx usa o client da transação e não revalida (fica para depois do commit)", async () => {
  const {
    database: tx,
    lifecycle,
    revalidated,
    updates,
  } = makeFixture([{ id: "1", slug: "ativa", status: "active" }]);

  const result = await lifecycle.closeJobs({
    reason: "teste",
    status: "inactive",
    tx: tx as never,
    where: {},
  });

  assert.deepEqual(result.slugs, ["ativa"]);
  assert.equal(updates.length, 1);
  assert.equal(revalidated.length, 0);
});

test("activateJobs devolve ao radar, grava dados extras e enfileira URL_UPDATED", async () => {
  const { enqueued, lifecycle, revalidated, updates } = makeFixture([
    { id: "1", slug: "em-revisao", status: "pending_review" },
  ]);
  const approvedAt = new Date("2026-10-09T12:00:00.000Z");

  await lifecycle.activateJobs({
    data: { reviewApprovedAt: approvedAt },
    reason: "teste",
    where: {},
  });

  assert.deepEqual(updates, [
    { data: { reviewApprovedAt: approvedAt, status: "active" }, ids: ["1"] },
  ]);
  assert.deepEqual(enqueued, [
    { priority: 10, slug: "em-revisao", type: "URL_UPDATED" },
  ]);
  assert.deepEqual(revalidated, [{ reason: "published", slug: "em-revisao" }]);
});

test("onStatusChanged: saiu do radar enfileira DELETED, voltou enfileira UPDATED, resto nada", async () => {
  const { enqueued, lifecycle } = makeFixture([]);

  await lifecycle.onStatusChanged({
    from: "active",
    slug: "a",
    to: "inactive",
  });
  await lifecycle.onStatusChanged({
    from: "inactive",
    slug: "b",
    to: "active",
  });
  await lifecycle.onStatusChanged({
    from: "inactive",
    slug: "c",
    to: "removed",
  });
  await lifecycle.onStatusChanged({
    from: "active",
    slug: null,
    to: "removed",
  });

  assert.deepEqual(
    enqueued.map((e) => `${e.slug}:${e.type}`),
    ["a:URL_DELETED", "b:URL_UPDATED"],
  );
});
