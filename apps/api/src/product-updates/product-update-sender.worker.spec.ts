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
  enabled?: boolean;
  // Hook opcional pra simular uma corrida real: chamado toda vez que uma
  // delivery é marcada PROCESSING, ANTES do worker reconferir o status da
  // campanha-pai — é o ponto exato onde um cancelamento concorrente
  // aconteceria de verdade entre o claim e o envio.
  onClaimed?: (deliveryId: string) => void;
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
  const sendToDeliveryCalls: string[] = [];
  let findManyCalls = 0;

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
        where: {
          status?: string | { in: string[] };
          productUpdate?: { status: string };
        };
        take?: number;
      }) => {
        findManyCalls += 1;
        const status = where.status;
        const parentStatus = where.productUpdate?.status;
        const matches = Array.from(deliveries.values()).filter((d) => {
          const statusOk =
            typeof status === "string"
              ? d.status === status
              : status && "in" in status
                ? status.in.includes(d.status)
                : true;
          if (!statusOk) return false;
          if (parentStatus === undefined) return true;
          return productUpdates.get(d.productUpdateId)?.status === parentStatus;
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
        if (data.status === "PROCESSING") {
          options.onClaimed?.(where.id);
        }
        return next;
      },
      count: async ({ where }: { where: Record<string, unknown> }) => {
        const productUpdateId = where.productUpdateId as string;
        const statusFilter = where.status as string | { in: string[] };
        const matchesStatus = (status: string) =>
          typeof statusFilter === "string"
            ? status === statusFilter
            : statusFilter.in.includes(status);
        return Array.from(deliveries.values()).filter(
          (d) =>
            d.productUpdateId === productUpdateId && matchesStatus(d.status),
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
      sendToDeliveryCalls.push(deliveryId);
      const result = options.sendResults[deliveryId];
      if (typeof result === "function") return result();
      return result;
    },
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const funnelEvents = {
    record: async () => {},
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const worker = new ProductUpdateSenderWorker(
    database,
    lock,
    emailService,
    funnelEvents,
    {
      PRODUCT_UPDATES_ENABLED: options.enabled ?? true,
      PRODUCT_UPDATE_SEND_RATE_PER_SECOND: 5,
    },
  );

  return {
    worker,
    deliveries,
    productUpdates,
    sendToDeliveryCalls,
    getFindManyCalls: () => findManyCalls,
  };
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

// C2 — o worker nunca pode enviar uma delivery cuja campanha-pai não está
// SENDING, nem no findMany (join productUpdate.status), nem se a campanha
// mudar de status DEPOIS do claim e ANTES do envio de fato (recheck
// imediatamente antes da chamada ao SES).

test("uma delivery PENDING de campanha FAILED nunca é buscada nem enviada", async () => {
  const { worker, deliveries, sendToDeliveryCalls } = createFixture({
    deliveries: [{ id: "d1", productUpdateId: "pu1" }],
    sendResults: {
      d1: { sent: true, outcome: "SENT", providerMessageId: "msg-1" },
    },
    productUpdates: { pu1: { status: "FAILED" } },
  });

  await worker.processPendingBatch();

  assert.equal(deliveries.get("d1")?.status, "PENDING");
  assert.equal(sendToDeliveryCalls.length, 0);
});

test("uma delivery PENDING de campanha CANCELLED nunca é buscada nem enviada", async () => {
  const { worker, deliveries, sendToDeliveryCalls } = createFixture({
    deliveries: [{ id: "d1", productUpdateId: "pu1" }],
    sendResults: {
      d1: { sent: true, outcome: "SENT", providerMessageId: "msg-1" },
    },
    productUpdates: { pu1: { status: "CANCELLED" } },
  });

  await worker.processPendingBatch();

  assert.equal(deliveries.get("d1")?.status, "PENDING");
  assert.equal(sendToDeliveryCalls.length, 0);
});

test("cancelamento entre o claim (PROCESSING) e o envio impede a chamada ao SES — delivery vira CANCELLED", async () => {
  const { worker, deliveries, productUpdates, sendToDeliveryCalls } =
    createFixture({
      deliveries: [{ id: "d1", productUpdateId: "pu1" }],
      sendResults: {
        d1: { sent: true, outcome: "SENT", providerMessageId: "msg-1" },
      },
      productUpdates: { pu1: { status: "SENDING" } },
      // No instante em que o worker marca a delivery PROCESSING (logo
      // depois do findMany, ANTES do recheck), simula um admin cancelando
      // a campanha concorrentemente.
      onClaimed: () => {
        productUpdates.set("pu1", { status: "CANCELLED" });
      },
    });

  await worker.processPendingBatch();

  assert.equal(sendToDeliveryCalls.length, 0, "SES nunca deveria ser chamado");
  assert.equal(deliveries.get("d1")?.status, "CANCELLED");
});

test("uma campanha SENDING continua sendo processada normalmente", async () => {
  const { worker, deliveries, sendToDeliveryCalls } = createFixture({
    deliveries: [{ id: "d1", productUpdateId: "pu1" }],
    sendResults: {
      d1: { sent: true, outcome: "SENT", providerMessageId: "msg-1" },
    },
    productUpdates: { pu1: { status: "SENDING" } },
  });

  await worker.processPendingBatch();

  assert.deepEqual(sendToDeliveryCalls, ["d1"]);
  assert.equal(deliveries.get("d1")?.status, "SENT");
});

// B1 — gate em profundidade: mesmo chamando processPendingBatch()
// diretamente (não só via tick()), a flag desligada impede qualquer
// consulta de PENDING e qualquer chamada ao EmailService.
test("PRODUCT_UPDATES_ENABLED=false: processPendingBatch não consulta PENDING nem chama EmailService", async () => {
  const { worker, deliveries, sendToDeliveryCalls, getFindManyCalls } =
    createFixture({
      enabled: false,
      deliveries: [{ id: "d1", productUpdateId: "pu1" }],
      sendResults: {
        d1: { sent: true, outcome: "SENT", providerMessageId: "msg-1" },
      },
      productUpdates: { pu1: { status: "SENDING" } },
    });

  const processed = await worker.processPendingBatch();

  assert.equal(processed, 0);
  assert.equal(getFindManyCalls(), 0);
  assert.equal(sendToDeliveryCalls.length, 0);
  assert.equal(deliveries.get("d1")?.status, "PENDING");
});
