import assert from "node:assert/strict";
import { test } from "node:test";

import { ProductUpdateSenderWorker } from "./product-update-sender.worker";

type FakeDelivery = {
  id: string;
  productUpdateId: string;
  status: string;
  attempts: number;
  lastError: string | null;
  providerMessageId: string | null;
  outcomeUnknownAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function createFixture(options: {
  deliveries: Array<
    Partial<FakeDelivery> & { id: string; productUpdateId: string }
  >;
  sendResults: Record<
    string,
    | {
        sent: true;
        outcome: "SENT" | "FAILED" | "OUTCOME_UNKNOWN";
        providerMessageId: string | null;
        errorMessage?: string;
      }
    | { sent: false; skippedReason: string }
    | (() => never)
  >;
  productUpdates?: Record<string, { status: string }>;
}) {
  const deliveries = new Map<string, FakeDelivery>();
  for (const d of options.deliveries) {
    deliveries.set(d.id, {
      attempts: 0,
      lastError: null,
      providerMessageId: null,
      outcomeUnknownAt: null,
      sentAt: null,
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...d,
    } as FakeDelivery);
  }

  const productUpdates = new Map(Object.entries(options.productUpdates ?? {}));

  const lock = {
    acquire: async () => true,
    release: async () => {},
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const database = {
    productUpdateDelivery: {
      findMany: async ({
        where,
        take,
      }: {
        where: Record<string, unknown>;
        take?: number;
      }) => {
        const status = where.status as string | { in: string[] } | undefined;
        const matches = Array.from(deliveries.values()).filter((d) => {
          if (typeof status === "string") return d.status === status;
          if (status && "in" in status) return status.in.includes(d.status);
          return true;
        });
        return take ? matches.slice(0, take) : matches;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const current = deliveries.get(where.id);
        assert.ok(current);
        const next = {
          ...current,
          ...data,
          updatedAt: new Date(),
        } as FakeDelivery;
        deliveries.set(where.id, next);
        return next;
      },
      count: async ({ where }: { where: Record<string, unknown> }) => {
        const productUpdateId = where.productUpdateId as string;
        const statusFilter = where.status as { in: string[] };
        return Array.from(deliveries.values()).filter(
          (d) =>
            d.productUpdateId === productUpdateId &&
            statusFilter.in.includes(d.status),
        ).length;
      },
    },
    productUpdate: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const pu = productUpdates.get(where.id);
        return pu ?? null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const current = productUpdates.get(where.id) ?? { status: "SENDING" };
        const next = { ...current, ...data };
        productUpdates.set(where.id, next);
        return next;
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const emailService = {
    sendToDelivery: async (deliveryId: string) => {
      const result = options.sendResults[deliveryId];
      if (typeof result === "function") return result();
      return result;
    },
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const worker = new ProductUpdateSenderWorker(database, lock, emailService, {
    PRODUCT_UPDATES_ENABLED: true,
    PRODUCT_UPDATE_SEND_RATE_PER_SECOND: 5,
  });

  return { worker, deliveries, productUpdates };
}

test("processPendingBatch marks a successful send as SENT", async () => {
  const { worker, deliveries } = createFixture({
    deliveries: [{ id: "d1", productUpdateId: "pu1" }],
    sendResults: {
      d1: { sent: true, outcome: "SENT", providerMessageId: "msg-1" },
    },
    productUpdates: { pu1: { status: "SENDING" } },
  });

  await worker.processPendingBatch();

  assert.equal(deliveries.get("d1")?.status, "SENT");
  assert.equal(deliveries.get("d1")?.providerMessageId, "msg-1");
});

test("OUTCOME_UNKNOWN never gets requeued to PENDING", async () => {
  const { worker, deliveries } = createFixture({
    deliveries: [{ id: "d1", productUpdateId: "pu1" }],
    sendResults: {
      d1: { sent: true, outcome: "OUTCOME_UNKNOWN", providerMessageId: null },
    },
    productUpdates: { pu1: { status: "SENDING" } },
  });

  await worker.processPendingBatch();

  const delivery = deliveries.get("d1");
  assert.equal(delivery?.status, "OUTCOME_UNKNOWN");
  assert.ok(delivery?.outcomeUnknownAt);
});

test("an unexpected exception during send never reverts to PENDING — always OUTCOME_UNKNOWN", async () => {
  const { worker, deliveries } = createFixture({
    deliveries: [{ id: "d1", productUpdateId: "pu1" }],
    sendResults: {
      d1: () => {
        throw new Error("network exploded");
      },
    },
    productUpdates: { pu1: { status: "SENDING" } },
  });

  await worker.processPendingBatch();

  const delivery = deliveries.get("d1");
  assert.equal(delivery?.status, "OUTCOME_UNKNOWN");
  assert.match(delivery?.lastError ?? "", /network exploded/);
});

test("a stale PROCESSING delivery is recovered to OUTCOME_UNKNOWN, never PENDING", async () => {
  const staleDate = new Date(Date.now() - 20 * 60_000);
  const { worker, deliveries } = createFixture({
    deliveries: [
      {
        id: "d1",
        productUpdateId: "pu1",
        status: "PROCESSING",
        updatedAt: staleDate,
      },
    ],
    sendResults: {},
    productUpdates: { pu1: { status: "SENDING" } },
  });

  await worker.processPendingBatch();

  assert.equal(deliveries.get("d1")?.status, "OUTCOME_UNKNOWN");
});

test("a confirmed FAILED result retries up to the attempt limit, then stays FAILED", async () => {
  const { worker, deliveries } = createFixture({
    deliveries: [{ id: "d1", productUpdateId: "pu1", attempts: 2 }],
    sendResults: {
      d1: {
        sent: true,
        outcome: "FAILED",
        providerMessageId: null,
        errorMessage: "rejected",
      },
    },
    productUpdates: { pu1: { status: "SENDING" } },
  });

  await worker.processPendingBatch();

  const delivery = deliveries.get("d1");
  assert.equal(delivery?.attempts, 3);
  assert.equal(delivery?.status, "FAILED");
});

test("campaign moves to COMPLETED once no PENDING/PROCESSING deliveries remain", async () => {
  const { worker, productUpdates } = createFixture({
    deliveries: [{ id: "d1", productUpdateId: "pu1" }],
    sendResults: {
      d1: { sent: true, outcome: "SENT", providerMessageId: "msg-1" },
    },
    productUpdates: { pu1: { status: "SENDING" } },
  });

  await worker.processPendingBatch();

  assert.equal(productUpdates.get("pu1")?.status, "COMPLETED");
});

test("campaign stays SENDING while a delivery beyond the batch size is still PENDING", async () => {
  // batchSize = round(PRODUCT_UPDATE_SEND_RATE_PER_SECOND) = 5 nesta
  // fixture — 6 deliveries garante que uma fique de fora do lote.
  const ids = Array.from({ length: 6 }, (_, i) => `d${i + 1}`);
  const { worker, productUpdates, deliveries } = createFixture({
    deliveries: ids.map((id) => ({ id, productUpdateId: "pu1" })),
    sendResults: Object.fromEntries(
      ids.map((id) => [
        id,
        { sent: true, outcome: "SENT", providerMessageId: `msg-${id}` },
      ]),
    ),
    productUpdates: { pu1: { status: "SENDING" } },
  });

  await worker.processPendingBatch();

  const stillPending = Array.from(deliveries.values()).filter(
    (d) => d.status === "PENDING",
  );
  assert.equal(stillPending.length, 1);
  assert.equal(productUpdates.get("pu1")?.status, "SENDING");
});
