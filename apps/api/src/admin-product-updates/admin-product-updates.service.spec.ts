import assert from "node:assert/strict";
import { test } from "node:test";

import { AdminProductUpdatesService } from "./admin-product-updates.service";

function createFixture() {
  const productUpdates = new Map([["pu-1", { id: "pu-1", status: "SENDING" }]]);
  const deliveries = [
    { id: "d1", productUpdateId: "pu-1", status: "SENT" },
    { id: "d2", productUpdateId: "pu-1", status: "SENT" },
    { id: "d3", productUpdateId: "pu-1", status: "FAILED" },
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
