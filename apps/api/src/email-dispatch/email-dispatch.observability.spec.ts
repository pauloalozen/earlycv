import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { AuthService } from "../auth/auth.service";
import { MonitorPublicController } from "../monitor/monitor-public.controller";
import { PlansService } from "../plans/plans.service";
import { createFixture } from "./email-dispatch.fixtures";
import { createTable } from "./email-dispatch.test-support";
import { EmailDispatchWebhookService } from "./email-dispatch-webhook.service";

// Falhas e ausências de fiação precisam ser OBSERVÁVEIS (tokens estáveis no
// log do deploy), não só "não acontecer".

function capture(target: object) {
  const lines: Array<{ level: string; message: string }> = [];
  // biome-ignore lint/suspicious/noExplicitAny: troca do logger privado no teste
  (target as any).logger = {
    log: (message: string) => lines.push({ level: "log", message }),
    warn: (message: string) => lines.push({ level: "warn", message }),
    error: (message: string) => lines.push({ level: "error", message }),
  };
  return lines;
}

const funnel = { record: async () => ({ event: {}, ingested: false }) };

test("PlansService WITHOUT the dispatch dependency warns at boot; with it, silent", () => {
  const without = new PlansService({} as never, funnel as never);
  const lines = capture(without);
  without.onModuleInit();
  assert.deepEqual(lines, [
    {
      level: "warn",
      message:
        "email_dispatch_dependency_missing consumer=PlansService effect=purchase_confirmations_disabled",
    },
  ]);

  const withDep = new PlansService(
    {} as never,
    funnel as never,
    undefined,
    undefined,
    undefined,
    { enqueuePurchaseConfirmationInTransaction: async () => true },
  );
  const quiet = capture(withDep);
  withDep.onModuleInit();
  assert.equal(quiet.length, 0);
});

test("AuthService WITHOUT the dispatch dependency warns at boot; with it, silent", () => {
  const without = new AuthService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const lines = capture(without);
  without.onModuleInit();
  assert.equal(lines.length, 1);
  assert.match(
    lines[0].message,
    /^email_dispatch_dependency_missing consumer=AuthService /,
  );

  const withDep = new AuthService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    {
      enqueueRelationshipForVerifiedUser: async () => ({
        welcome: false,
        feedback: false,
      }),
    },
  );
  const quiet = capture(withDep);
  withDep.onModuleInit();
  assert.equal(quiet.length, 0);
});

test("MonitorPublicController without the EMAIL_DISPATCH webhook handler or shared suppression warns at boot", () => {
  const controller = new MonitorPublicController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const lines = capture(controller);
  controller.onModuleInit();
  assert.equal(lines.length, 1);
  assert.match(
    lines[0].message,
    /^email_dispatch_dependency_missing consumer=MonitorPublicController /,
  );

  const complete = new MonitorPublicController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const quiet = capture(complete);
  complete.onModuleInit();
  assert.equal(quiet.length, 0);
});

test("a failed purchase enqueue is logged at ERROR with a stable token carrying the purchase id and 'credits_unaffected'", async () => {
  const f = createFixture({
    env: { EMAIL_PURCHASE_CONFIRMATION_MODE: "SHADOW" },
    production: true,
  });
  const lines = capture(f.service);
  const tx = {
    $executeRawUnsafe: async () => 0,
    planPurchase: {
      findUnique: async () => {
        throw new Error("boom");
      },
    },
    user: { findUnique: async () => ({ email: "a@b.com" }) },
    emailDispatch: { createMany: async () => ({ count: 0 }) },
  };

  const queued = await f.service.enqueuePurchaseConfirmationInTransaction(
    tx as never,
    {
      purchaseId: "p_123",
      userId: "u1",
      creditsApplied: 1,
      analysisCreditsApplied: 1,
      isUnlimited: false,
    },
  );

  assert.equal(queued, false);
  const error = lines.find((l) => l.level === "error");
  assert.ok(error);
  assert.match(
    error.message,
    /^email_dispatch_enqueue_failed kind=PURCHASE_CONFIRMATION purchaseId=p_123 credits_unaffected=true reason=boom$/,
  );
});

test("a failed relationship enqueue is logged at ERROR with a stable token and never throws", async () => {
  const f = createFixture({
    env: { EMAIL_WELCOME_MODE: "SHADOW" },
    production: true,
  });
  const lines = capture(f.service);
  f.database.user.findUnique = async () => {
    throw new Error("db down");
  };

  await f.service.enqueueRelationshipForVerifiedUser("u9");

  assert.equal(
    lines.find((l) => l.level === "error")?.message,
    "email_dispatch_enqueue_failed kind=RELATIONSHIP userId=u9 reason=db down",
  );
});

test("webhook processing is visible in the logs: event type + correlation, and the subscription change — without e-mail addresses", async () => {
  const emailDispatch = createTable({ uniqueKeys: ["dedupeKey"] });
  const emailDispatchEvent = createTable({ uniqueKeys: ["providerEventId"] });
  const relationshipEmailPreference = createTable({ uniqueKeys: ["userId"] });
  const service = new EmailDispatchWebhookService(
    {
      emailDispatch,
      emailDispatchEvent,
      relationshipEmailPreference,
      user: { findUnique: async () => ({ id: "user_1" }) },
      // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
    } as any,
    { AWS_SES_RELATIONSHIP_TOPIC_NAME: "relationship" },
  );
  const lines = capture(service);
  const dispatch = await emailDispatch.create({
    data: { dedupeKey: "welcome:u", status: "SENT" },
  });

  await service.processSesEvent("sns-1", {
    eventType: "Delivery",
    mail: {
      messageId: "m1",
      tags: {
        correlationType: ["EMAIL_DISPATCH"],
        correlationId: [dispatch.id],
      },
    },
  });
  await service.processSubscriptionEvent("sns-2", {
    eventType: "Subscription",
    mail: { destination: ["paulo.alozen@gmail.com"] },
    subscription: {
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

  const messages = lines.map((l) => l.message);
  assert.ok(
    messages.includes(
      `email_dispatch_event type=DELIVERED dispatchId=${dispatch.id}`,
    ),
  );
  assert.ok(
    messages.includes(
      "email_dispatch_subscription change=OPT_OUT userId=user_1",
    ),
  );
  assert.ok(messages.every((m) => !m.includes("@")));
});
