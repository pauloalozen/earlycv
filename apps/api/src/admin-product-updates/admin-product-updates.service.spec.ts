import assert from "node:assert/strict";
import { test } from "node:test";

import { AdminProductUpdatesService } from "./admin-product-updates.service";

function createFixture() {
  const productUpdates = new Map([
    ["pu-1", { id: "pu-1", status: "SENDING" }],
    ["pu-2", { id: "pu-2", status: "SENDING" }],
  ]);
  const deliveries = [
    { id: "d1", productUpdateId: "pu-1", status: "SENT" },
    { id: "d2", productUpdateId: "pu-1", status: "SENT" },
    { id: "d3", productUpdateId: "pu-1", status: "FAILED" },
    { id: "d4", productUpdateId: "pu-2", status: "SENT" },
  ];
  const events = [
    { deliveryId: "d1", type: "OPENED" },
    { deliveryId: "d1", type: "OPENED" }, // aberto 2x — não pode contar 2x
    { deliveryId: "d2", type: "OPENED" },
    { deliveryId: "d1", type: "CLICKED" },
    { deliveryId: "d3", type: "BOUNCED" },
    { deliveryId: "d3", type: "COMPLAINED" },
  ];

  const database = {
    productUpdate: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        productUpdates.get(where.id) ?? null,
    },
    productUpdateDelivery: {
      count: async ({ where }: { where: Record<string, unknown> }) =>
        deliveries.filter(
          (d) =>
            d.productUpdateId === where.productUpdateId &&
            d.status === where.status,
        ).length,
      // Exige id E productUpdateId simultaneamente — é exatamente essa
      // dupla condição que corrige o IDOR (ver
      // AdminProductUpdatesService.deliveryTimeline).
      findFirst: async ({
        where,
      }: {
        where: { id: string; productUpdateId: string };
      }) =>
        deliveries.find(
          (d) =>
            d.id === where.id && d.productUpdateId === where.productUpdateId,
        ) ?? null,
    },
    productUpdateEvent: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        const type = where.type as string;
        const relation = where.delivery as { productUpdateId: string };
        const deliveryIds = new Set(
          deliveries
            .filter((d) => d.productUpdateId === relation.productUpdateId)
            .map((d) => d.id),
        );
        return events.filter(
          (e) => e.type === type && deliveryIds.has(e.deliveryId),
        ).length;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        // Timeline de uma delivery específica (deliveryTimeline).
        if (typeof where.deliveryId === "string") {
          return events
            .filter((e) => e.deliveryId === where.deliveryId)
            .map((e) => ({ ...e }));
        }

        // Agregação por campanha (computeStats).
        const type = where.type as string;
        const relation = where.delivery as { productUpdateId: string };
        const deliveryIds = new Set(
          deliveries
            .filter((d) => d.productUpdateId === relation.productUpdateId)
            .map((d) => d.id),
        );
        const matching = events.filter(
          (e) => e.type === type && deliveryIds.has(e.deliveryId),
        );
        const distinctDeliveryIds = Array.from(
          new Set(matching.map((e) => e.deliveryId)),
        );
        return distinctDeliveryIds.map((deliveryId) => ({ deliveryId }));
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const productUpdatesService = {} as never;
  const templateService = {} as never;
  const subscriptionService = {} as never;

  return new AdminProductUpdatesService(
    database,
    productUpdatesService,
    templateService,
    subscriptionService,
  );
}

test("stats counts unique opened/clicked deliveries, never raw duplicate events", async () => {
  const service = createFixture();

  const stats = await service.stats("pu-1");

  assert.equal(stats.uniqueOpened, 2); // d1 (2 eventos) + d2 (1 evento) = 2 entregas distintas
  assert.equal(stats.uniqueClicked, 1);
  assert.equal(stats.bounced, 1);
  assert.equal(stats.complained, 1);
  assert.equal(stats.sent, 2);
  assert.equal(stats.failed, 1);
});

test("stats throws NotFoundException for a non-existent campaign", async () => {
  const service = createFixture();
  await assert.rejects(() => service.stats("does-not-exist"));
});

// A1 — IDOR entre campanha e delivery: d4 pertence à campanha pu-2. Pedir
// a timeline de d4 usando o :id de pu-1 na URL precisa dar 404, nunca
// devolver os dados de d4.
test("deliveryTimeline exige productUpdateId e deliveryId simultaneamente — 404 numa delivery de outra campanha", async () => {
  const service = createFixture();

  await assert.rejects(() => service.deliveryTimeline("pu-1", "d4"));

  // A mesma delivery, com o productUpdateId correto, funciona normalmente.
  const timeline = await service.deliveryTimeline("pu-2", "d4");
  assert.equal(timeline.delivery.id, "d4");
});
