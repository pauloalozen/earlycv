import assert from "node:assert/strict";
import { test } from "node:test";

import { createTable } from "./email-dispatch.test-support";
import { EmailDispatchWebhookService } from "./email-dispatch-webhook.service";

function setup(topic: string | null = "relationship") {
  const emailDispatch = createTable({ uniqueKeys: ["dedupeKey"] });
  const emailDispatchEvent = createTable({ uniqueKeys: ["providerEventId"] });
  const relationshipEmailPreference = createTable({ uniqueKeys: ["userId"] });
  const user = {
    findUnique: async ({ where }: { where: { email: string } }) =>
      where.email === "maria@example.com" ? { id: "user_1" } : null,
  };
  const database = {
    emailDispatch,
    emailDispatchEvent,
    relationshipEmailPreference,
    user,
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;
  const service = new EmailDispatchWebhookService(database, {
    AWS_SES_RELATIONSHIP_TOPIC_NAME: topic ?? undefined,
  });
  return {
    service,
    emailDispatch,
    emailDispatchEvent,
    relationshipEmailPreference,
  };
}

const sesEvent = (eventType: string, correlationId = "disp_1") => ({
  eventType,
  mail: {
    messageId: "ses-msg-1",
    timestamp: "2026-10-05T12:00:00.000Z",
    tags: {
      correlationType: ["EMAIL_DISPATCH"],
      correlationId: [correlationId],
    },
  },
  ...(eventType === "Delivery"
    ? { delivery: { timestamp: "2026-10-05T12:00:05.000Z" } }
    : {}),
});

test("records Send/Delivery/Bounce/Complaint/Reject events correlated by tag, idempotent by SNS message id", async () => {
  const { service, emailDispatch, emailDispatchEvent } = setup();
  const dispatch = await emailDispatch.create({
    data: { dedupeKey: "welcome:u", status: "SENT" },
  });

  const first = await service.processSesEvent(
    "sns-1",
    sesEvent("Delivery", dispatch.id),
  );
  const duplicate = await service.processSesEvent(
    "sns-1",
    sesEvent("Delivery", dispatch.id),
  );

  assert.deepEqual(first, { processed: true });
  assert.deepEqual(duplicate, { processed: false, reason: "duplicate" });
  assert.equal(emailDispatchEvent.rows.length, 1);
  assert.equal(emailDispatchEvent.rows[0].type, "DELIVERED");
  assert.equal(emailDispatchEvent.rows[0].dispatchId, dispatch.id);
  assert.equal(
    emailDispatchEvent.rows[0].occurredAt.toISOString(),
    "2026-10-05T12:00:05.000Z",
  );
});

test("open/click and unknown event types are ignored — opens are NOT treated as readership", async () => {
  const { service, emailDispatchEvent } = setup();

  assert.deepEqual(await service.processSesEvent("a", sesEvent("Open")), {
    processed: false,
    reason: "unsupported_type",
  });
  assert.deepEqual(await service.processSesEvent("b", sesEvent("Click")), {
    processed: false,
    reason: "unsupported_type",
  });
  assert.equal(emailDispatchEvent.rows.length, 0);
});

test("an event with no matching dispatch is still recorded (dispatchId null) and does not throw", async () => {
  const { service, emailDispatchEvent } = setup();

  const result = await service.processSesEvent(
    "sns-9",
    sesEvent("Delivery", "missing"),
  );

  assert.deepEqual(result, { processed: true });
  assert.equal(emailDispatchEvent.rows[0].dispatchId, null);
});

test("OUTCOME_UNKNOWN resolves to SENT on Delivery/Send and to FAILED on Bounce/Complaint/Reject", async () => {
  for (const [eventType, expected] of [
    ["Delivery", "SENT"],
    ["Send", "SENT"],
    ["Bounce", "FAILED"],
    ["Complaint", "FAILED"],
    ["Reject", "FAILED"],
  ] as const) {
    const { service, emailDispatch } = setup();
    const dispatch = await emailDispatch.create({
      data: { dedupeKey: `welcome:${eventType}`, status: "OUTCOME_UNKNOWN" },
    });

    await service.processSesEvent(
      `sns-${eventType}`,
      sesEvent(eventType, dispatch.id),
    );

    assert.equal(emailDispatch.rows[0].status, expected, eventType);
    assert.equal(emailDispatch.rows[0].outcomeUnknownAt, null, eventType);
  }
});

test("events never change the status of a dispatch that is not OUTCOME_UNKNOWN", async () => {
  const { service, emailDispatch } = setup();
  const dispatch = await emailDispatch.create({
    data: { dedupeKey: "welcome:x", status: "SENT" },
  });

  await service.processSesEvent("sns-1", sesEvent("Bounce", dispatch.id));

  assert.equal(emailDispatch.rows[0].status, "SENT");
});

const subscription = (
  topics: Record<string, "OPT_IN" | "OPT_OUT">,
  old: Record<string, "OPT_IN" | "OPT_OUT">,
  all = false,
) => {
  const toPrefs = (
    t: Record<string, "OPT_IN" | "OPT_OUT">,
    unsubscribeAll = false,
  ) => ({
    unsubscribeAll,
    topicSubscriptionStatus: Object.entries(t).map(
      ([topicName, subscriptionStatus]) => ({
        topicName,
        subscriptionStatus,
      }),
    ),
  });
  return {
    eventType: "Subscription" as const,
    subscription: {
      source: "maria@example.com",
      newTopicPreferences: toPrefs(topics, all),
      oldTopicPreferences: toPrefs(old),
    },
  };
};

test("opting out of the RELATIONSHIP topic marks the user unsubscribed from relationship only", async () => {
  const { service, relationshipEmailPreference } = setup();

  const result = await service.processSubscriptionEvent(
    "sns-1",
    subscription(
      { "product-updates": "OPT_IN", relationship: "OPT_OUT" },
      { "product-updates": "OPT_IN", relationship: "OPT_IN" },
    ),
  );

  assert.deepEqual(result, { processed: true });
  assert.equal(relationshipEmailPreference.rows[0].subscribed, false);
  assert.ok(relationshipEmailPreference.rows[0].unsubscribedAt);
});

test("opting out of PRODUCT UPDATES never touches relationship preference", async () => {
  const { service, relationshipEmailPreference } = setup();

  const result = await service.processSubscriptionEvent(
    "sns-1",
    subscription(
      { "product-updates": "OPT_OUT", relationship: "OPT_IN" },
      { "product-updates": "OPT_IN", relationship: "OPT_IN" },
    ),
  );

  assert.deepEqual(result, { processed: false, reason: "unsupported_type" });
  assert.equal(relationshipEmailPreference.rows.length, 0);
});

test("unsubscribe-all opts out of relationship too; re-subscribing flips it back", async () => {
  const { service, relationshipEmailPreference } = setup();

  await service.processSubscriptionEvent(
    "sns-1",
    subscription({ relationship: "OPT_IN" }, { relationship: "OPT_IN" }, true),
  );
  assert.equal(relationshipEmailPreference.rows[0].subscribed, false);

  await service.processSubscriptionEvent(
    "sns-2",
    subscription({ relationship: "OPT_IN" }, { relationship: "OPT_OUT" }),
  );
  assert.equal(relationshipEmailPreference.rows[0].subscribed, true);
  assert.equal(relationshipEmailPreference.rows[0].unsubscribedAt, null);
});

test("subscription events for an unknown address or malformed payload are safe no-ops", async () => {
  const { service, relationshipEmailPreference } = setup();

  const unknown = subscription(
    { relationship: "OPT_OUT" },
    { relationship: "OPT_IN" },
  );
  unknown.subscription.source = "ghost@example.com";
  assert.deepEqual(await service.processSubscriptionEvent("s1", unknown), {
    processed: true,
  });
  assert.deepEqual(
    await service.processSubscriptionEvent("s2", { eventType: "Subscription" }),
    { processed: false, reason: "malformed_subscription_payload" },
  );
  assert.equal(relationshipEmailPreference.rows.length, 0);
});

test("without a configured relationship topic only unsubscribe-all can opt out", async () => {
  const { service, relationshipEmailPreference } = setup(null);

  await service.processSubscriptionEvent(
    "s1",
    subscription({ relationship: "OPT_OUT" }, { relationship: "OPT_IN" }),
  );
  assert.equal(relationshipEmailPreference.rows.length, 0);
});

test("official AWS Subscription format: opt-out of the relationship topic is applied to the user found via mail.destination", async () => {
  const { service, relationshipEmailPreference } = setup();

  const result = await service.processSubscriptionEvent("sns-official", {
    eventType: "Subscription",
    mail: { destination: ["maria@example.com"] },
    subscription: {
      contactList: "ContactListName",
      source: "UnsubscribeHeader",
      newTopicPreferences: {
        unsubscribeAll: false,
        topicSubscriptionStatus: [
          { topicName: "relationship", subscriptionStatus: "OptOut" },
        ],
      },
      oldTopicPreferences: {
        unsubscribeAll: false,
        topicSubscriptionStatus: [
          { topicName: "relationship", subscriptionStatus: "OptIn" },
        ],
      },
    },
  });

  assert.deepEqual(result, { processed: true });
  assert.equal(relationshipEmailPreference.rows[0].subscribed, false);
});
