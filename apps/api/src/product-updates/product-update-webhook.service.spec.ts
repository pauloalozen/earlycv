import assert from "node:assert/strict";
import { test } from "node:test";

import { Prisma } from "@prisma/client";

import { ProductUpdateWebhookService } from "./product-update-webhook.service";

function createFixture() {
  const events = new Map<
    string,
    { providerEventId: string; deliveryId: string | null; type: string }
  >();
  const deliveries = new Map<
    string,
    {
      id: string;
      userId: string | null;
      providerMessageId: string | null;
      status: string;
    }
  >();
  const suppressed: Array<{ userId: string; reason: string }> = [];
  const resubscribed: string[] = [];
  const deliveryUpdates: Array<{ id: string; data: Record<string, unknown> }> =
    [];

  deliveries.set("delivery-1", {
    id: "delivery-1",
    userId: "user-1",
    providerMessageId: "msg-1",
    status: "SENT",
  });

  const database = {
    productUpdateDelivery: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        deliveries.get(where.id) ?? null,
      findFirst: async ({ where }: { where: { providerMessageId: string } }) =>
        Array.from(deliveries.values()).find(
          (d) => d.providerMessageId === where.providerMessageId,
        ) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const current = deliveries.get(where.id);
        assert.ok(current);
        deliveryUpdates.push({ id: where.id, data });
        const next = { ...current, ...data };
        deliveries.set(where.id, next);
        return next;
      },
    },
    productUpdateEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const providerEventId = data.providerEventId as string;
        if (events.has(providerEventId)) {
          throw new Prisma.PrismaClientKnownRequestError("unique constraint", {
            code: "P2002",
            clientVersion: "6.19.3",
          });
        }
        const record = {
          providerEventId,
          deliveryId: (data.deliveryId as string | null) ?? null,
          type: data.type as string,
        };
        events.set(providerEventId, record);
        return record;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        where.email === "user1@example.com" ? { id: "user-1" } : null,
    },
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const subscriptionService = {
    markSuppressed: async (userId: string, reason: string) => {
      suppressed.push({ userId, reason });
    },
    markResubscribed: async (userId: string) => {
      resubscribed.push(userId);
    },
    findUserIdByEmail: async (email: string) =>
      email === "user1@example.com" ? "user-1" : null,
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;

  const service = new ProductUpdateWebhookService(
    database,
    subscriptionService,
    { AWS_SES_PRODUCT_UPDATE_TOPIC_NAME: "product-updates" },
  );

  return { service, deliveries, suppressed, resubscribed, deliveryUpdates };
}

test("a valid Delivery event creates a ProductUpdateEvent correlated by tag", async () => {
  const { service } = createFixture();

  const result = await service.processSesEvent("sns-1", {
    eventType: "Delivery",
    mail: {
      messageId: "msg-1",
      timestamp: "2026-09-15T10:00:00.000Z",
      tags: {
        correlationType: ["PRODUCT_UPDATE"],
        correlationId: ["delivery-1"],
      },
    },
    delivery: { timestamp: "2026-09-15T10:00:05.000Z" },
  });

  assert.equal(result.processed, true);
});

test("the same SNS MessageId delivered twice is processed only once — idempotent", async () => {
  const { service } = createFixture();
  const payload = {
    eventType: "Delivery",
    mail: { messageId: "msg-1", tags: { correlationId: ["delivery-1"] } },
  };

  await service.processSesEvent("sns-1", payload);
  const second = await service.processSesEvent("sns-1", payload);

  assert.equal(second.processed, false);
  assert.equal(second.reason, "duplicate");
});

test("Bounce marks the delivery's user as suppressed locally, but never touches a null userId", async () => {
  const { service, suppressed } = createFixture();

  await service.processSesEvent("sns-1", {
    eventType: "Bounce",
    mail: { messageId: "msg-1", tags: { correlationId: ["delivery-1"] } },
    bounce: { timestamp: "2026-09-15T10:00:00.000Z" },
  });

  assert.deepEqual(suppressed, [{ userId: "user-1", reason: "BOUNCED" }]);
});

test("a Send/Reject sequence resolves a delivery stuck in OUTCOME_UNKNOWN, never touches an already-terminal delivery", async () => {
  const { service, deliveries, deliveryUpdates } = createFixture();
  const existing = deliveries.get("delivery-1");
  assert.ok(existing);
  deliveries.set("delivery-1", { ...existing, status: "OUTCOME_UNKNOWN" });

  await service.processSesEvent("sns-1", {
    eventType: "Send",
    mail: {
      messageId: "msg-1",
      timestamp: "2026-09-15T10:00:00.000Z",
      tags: { correlationId: ["delivery-1"] },
    },
  });

  assert.equal(deliveries.get("delivery-1")?.status, "SENT");
  assert.equal(deliveryUpdates.length, 1);
});

test("an unsupported eventType is rejected without creating an event", async () => {
  const { service } = createFixture();
  const result = await service.processSesEvent("sns-1", {
    eventType: "SomethingUnknown",
  });
  assert.equal(result.processed, false);
  assert.equal(result.reason, "unsupported_type");
});

test("processSubscriptionEvent with OPT_OUT for our topic suppresses the matching user as SES_OPT_OUT", async () => {
  const { service, suppressed } = createFixture();

  const result = await service.processSubscriptionEvent("sns-2", {
    eventType: "Subscription",
    subscription: {
      source: "user1@example.com",
      newTopicPreferences: {
        unsubscribeAll: false,
        topicSubscriptionStatus: [
          { topicName: "product-updates", subscriptionStatus: "OPT_OUT" },
        ],
      },
    },
  });

  assert.equal(result.processed, true);
  assert.deepEqual(suppressed, [{ userId: "user-1", reason: "SES_OPT_OUT" }]);
});

test("processSubscriptionEvent with OPT_IN reverses a previous suppression", async () => {
  const { service, resubscribed } = createFixture();

  await service.processSubscriptionEvent("sns-2", {
    eventType: "Subscription",
    subscription: {
      source: "user1@example.com",
      newTopicPreferences: {
        topicSubscriptionStatus: [
          { topicName: "product-updates", subscriptionStatus: "OPT_IN" },
        ],
      },
    },
  });

  assert.deepEqual(resubscribed, ["user-1"]);
});

test("processSubscriptionEvent for a different topic is ignored safely", async () => {
  const { service, suppressed, resubscribed } = createFixture();

  const result = await service.processSubscriptionEvent("sns-2", {
    eventType: "Subscription",
    subscription: {
      source: "user1@example.com",
      newTopicPreferences: {
        topicSubscriptionStatus: [
          { topicName: "some-other-topic", subscriptionStatus: "OPT_OUT" },
        ],
      },
    },
  });

  assert.equal(result.processed, false);
  assert.equal(suppressed.length, 0);
  assert.equal(resubscribed.length, 0);
});

test("processSubscriptionEvent with a malformed payload (no source) is ignored safely, never throws", async () => {
  const { service } = createFixture();

  const result = await service.processSubscriptionEvent("sns-2", {
    eventType: "Subscription",
  });

  assert.equal(result.processed, false);
  assert.equal(result.reason, "malformed_subscription_payload");
});
