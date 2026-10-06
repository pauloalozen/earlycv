import assert from "node:assert/strict";
import { test } from "node:test";

import { baseUser, createFixture } from "./email-dispatch.fixtures";

const allOn = {
  EMAIL_WELCOME_MODE: "LIVE",
  EMAIL_FEEDBACK_MODE: "LIVE",
};

test("enqueue creates welcome (+10min) and feedback (signup+24h) once, dedupe-safe", async () => {
  const f = createFixture({ env: allOn, production: true });
  const now = new Date("2026-10-04T10:06:00.000Z"); // verificou 6 min após o cadastro

  const first = await f.service.enqueueRelationshipForVerifiedUser(
    "user_1",
    now,
  );
  const second = await f.service.enqueueRelationshipForVerifiedUser(
    "user_1",
    now,
  );

  assert.deepEqual(first, { welcome: true, feedback: true });
  assert.deepEqual(second, { welcome: true, feedback: true }); // idempotente, sem erro
  assert.equal(f.emailDispatch.rows.length, 2);

  const welcome = f.emailDispatch.rows.find((r) => r.kind === "WELCOME");
  const feedback = f.emailDispatch.rows.find(
    (r) => r.kind === "FEEDBACK_FIRST_USE",
  );
  assert.equal(welcome?.dedupeKey, "welcome:user_1");
  assert.equal(welcome?.scheduledFor.toISOString(), "2026-10-04T10:16:00.000Z");
  assert.equal(feedback?.dedupeKey, "feedback:user_1");
  // 04/10 10:00Z + 24h = 05/10 10:00Z = 07:00 BRT -> fora da janela -> 08:00 BRT
  assert.equal(
    feedback?.scheduledFor.toISOString(),
    "2026-10-05T11:00:00.000Z",
  );
  assert.ok(feedback?.expiresAt > feedback?.scheduledFor);
});

test("enqueue is a no-op when both kinds are OFF (default) — zero database footprint", async () => {
  const f = createFixture({ production: true });
  let userQueries = 0;
  const original = f.database.user.findUnique;
  f.database.user.findUnique = async (a: never) => {
    userQueries += 1;
    return original(a);
  };

  const result = await f.service.enqueueRelationshipForVerifiedUser("user_1");

  assert.deepEqual(result, { welcome: false, feedback: false });
  assert.equal(f.emailDispatch.rows.length, 0);
  assert.equal(userQueries, 0);
});

test("enqueue creates only the kinds whose mode is not OFF", async () => {
  const f = createFixture({
    env: { EMAIL_WELCOME_MODE: "SHADOW" },
    production: true,
  });

  const result = await f.service.enqueueRelationshipForVerifiedUser("user_1");

  assert.deepEqual(result, { welcome: true, feedback: false });
  assert.deepEqual(
    f.emailDispatch.rows.map((r) => r.kind),
    ["WELCOME"],
  );
});

test("enqueue never creates rows for an unverified email", async () => {
  const f = createFixture({
    env: allOn,
    production: true,
    users: [baseUser({ emailVerifiedAt: null })],
  });

  const result = await f.service.enqueueRelationshipForVerifiedUser("user_1");

  assert.deepEqual(result, { welcome: false, feedback: false });
  assert.equal(f.emailDispatch.rows.length, 0);
});

test("enqueue respects the new-signup cutoff: old base never enters, even verifying late", async () => {
  const f = createFixture({
    env: allOn,
    production: true,
    users: [baseUser({ createdAt: new Date("2026-09-20T10:00:00.000Z") })],
  });

  const result = await f.service.enqueueRelationshipForVerifiedUser("user_1");

  assert.deepEqual(result, { welcome: false, feedback: false });
  assert.equal(f.emailDispatch.rows.length, 0);
});

test("enqueue without a valid cutoff creates nothing", async () => {
  const f = createFixture({
    env: { ...allOn, EMAIL_RELATIONSHIP_START_AT: undefined },
    production: true,
  });

  assert.deepEqual(
    await f.service.enqueueRelationshipForVerifiedUser("user_1"),
    {
      welcome: false,
      feedback: false,
    },
  );
  assert.equal(f.emailDispatch.rows.length, 0);
});

test("late verification: welcome and feedback are never scheduled within 12h of each other", async () => {
  const f = createFixture({ env: allOn, production: true });
  const now = new Date("2026-10-14T13:00:00.000Z"); // 10 dias depois do cadastro

  await f.service.enqueueRelationshipForVerifiedUser("user_1", now);

  const welcome = f.emailDispatch.rows.find((r) => r.kind === "WELCOME");
  const feedback = f.emailDispatch.rows.find(
    (r) => r.kind === "FEEDBACK_FIRST_USE",
  );
  assert.ok(
    feedback.scheduledFor.getTime() - welcome.scheduledFor.getTime() >=
      12 * 3_600_000,
  );
});

test("enqueue NEVER throws, even if the database fails", async () => {
  const f = createFixture({ env: allOn, production: true });
  f.database.user.findUnique = async () => {
    throw new Error("db down");
  };

  const result = await f.service.enqueueRelationshipForVerifiedUser("user_1");

  assert.deepEqual(result, { welcome: false, feedback: false });
});

test("deliver sends RELATIONSHIP with the relationship topic, correlation tags and text+html", async () => {
  const f = createFixture({ env: allOn, production: true });

  await f.service.deliver({
    dispatchId: "disp_1",
    kind: "WELCOME",
    to: "maria@example.com",
    name: "Maria",
    realTransport: true,
  });

  assert.equal(f.sent.length, 1);
  const { category, message } = f.sent[0];
  assert.equal(category, "RELATIONSHIP");
  assert.equal(message.to, "maria@example.com");
  assert.deepEqual(message.listManagementOptions, {
    contactListName: "earlycv-contacts",
    topicName: "relationship", // nunca o tópico de Product Updates
  });
  assert.deepEqual(message.tags, {
    correlationType: "EMAIL_DISPATCH",
    correlationId: "disp_1",
    kind: "WELCOME",
  });
  assert.equal(message.idempotencyKey, "email-dispatch:disp_1");
  assert.ok(message.text.includes("{{amazonSESUnsubscribeUrl}}"));
  assert.ok(message.html.includes("{{amazonSESUnsubscribeUrl}}"));
});

test("deliver refuses to send when the send infra is not ready (never falls back)", async () => {
  const f = createFixture({
    env: { AWS_SES_RELATIONSHIP_CONFIGURATION_SET: "earlycv-bulk-email" },
    production: true,
  });

  await assert.rejects(
    () =>
      f.service.deliver({
        dispatchId: "d",
        kind: "WELCOME",
        to: "a@b.com",
        name: null,
        realTransport: true,
      }),
    /not ready/,
  );
  assert.equal(f.sent.length, 0);
});

test("sendTest: explicit recipient (even a blocked account), recorded as isTest, no user, one send", async () => {
  const f = createFixture();

  const result = await f.service.sendTest({
    kind: "FEEDBACK_FIRST_USE",
    to: "Paulo.Alozen@gmail.com",
    name: "Paulo",
    realTransport: true,
  });

  assert.equal(result.sent, true);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].message.to, "paulo.alozen@gmail.com");
  assert.equal(f.sent[0].message.subject, "Sobre a análise do seu currículo");
  assert.equal(f.emailDispatch.rows.length, 1);
  assert.equal(f.emailDispatch.rows[0].isTest, true);
  assert.equal(f.emailDispatch.rows[0].userId, null);
  assert.equal(f.emailDispatch.rows[0].status, "SENT");
});

test("sendTest refuses when not ready or when the address is suppressed", async () => {
  const notReady = createFixture({ env: { SES_EMAIL_ENABLED: false } });
  assert.deepEqual(
    await notReady.service.sendTest({
      kind: "WELCOME",
      to: "a@b.com",
      realTransport: true,
    }),
    { sent: false, reason: "not_ready:ses_disabled" },
  );
  assert.equal(notReady.sent.length, 0);

  const suppressed = createFixture();
  await suppressed.emailSuppression.create({
    data: { email: "a@b.com", reason: "COMPLAINT" },
  });
  assert.deepEqual(
    await suppressed.service.sendTest({ kind: "WELCOME", to: "A@B.com" }),
    { sent: false, reason: "suppressed:COMPLAINT" },
  );
  assert.equal(suppressed.sent.length, 0);
});

test("sendTest records a failed provider outcome without retrying", async () => {
  const f = createFixture({
    sendResults: [
      {
        outcome: "FAILED",
        provider: "SES",
        providerMessageId: null,
        errorMessage: "rejected",
      },
    ],
  });

  const result = await f.service.sendTest({
    kind: "WELCOME",
    to: "a@b.com",
    realTransport: true,
  });

  assert.equal(result.sent, true);
  assert.equal(f.sent.length, 1);
  assert.equal(f.emailDispatch.rows[0].status, "FAILED");
  assert.equal(f.emailDispatch.rows[0].lastError, "rejected");
});

// ---- Transporte fake por padrão ----------------------------------------

test("deliver with realTransport=false NEVER reaches the provider: fake result, fake id, any kind", async () => {
  const f = createFixture({ env: allOn, production: true });

  for (const kind of [
    "WELCOME",
    "FEEDBACK_FIRST_USE",
    "FEEDBACK_SECOND_CALL",
  ] as const) {
    const result = await f.service.deliver({
      dispatchId: "disp_9",
      kind,
      to: "maria@example.com",
      name: "Maria",
      realTransport: false,
    });
    assert.deepEqual(result, {
      outcome: "SENT",
      provider: "SES",
      providerMessageId: "fake:disp_9",
    });
  }
  assert.equal(f.sent.length, 0);
});

test("sendTest defaults to the FAKE transport in every environment — even in production, even with full infra", async () => {
  for (const production of [false, true]) {
    const f = createFixture({ production });

    const result = await f.service.sendTest({
      kind: "WELCOME",
      to: "paulo.alozen@gmail.com",
    });

    assert.equal(result.sent, true);
    assert.equal(f.sent.length, 0, `production=${production}`);
    assert.equal(
      f.emailDispatch.rows[0].providerMessageId?.startsWith("fake:"),
      true,
    );
  }
});

test("sendTest sends for real ONLY with the explicit realTransport option, to the informed recipient, one send", async () => {
  const f = createFixture({ production: false });

  await f.service.sendTest({
    kind: "WELCOME",
    to: "paulo.alozen@gmail.com",
    realTransport: true,
  });

  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].message.to, "paulo.alozen@gmail.com");
  assert.equal(f.emailDispatch.rows.length, 1);
});

test("sendTest(purchase) requires an explicit payload and renders the paid/coupon variants", async () => {
  const f = createFixture();
  assert.deepEqual(
    await f.service.sendTest({ kind: "PURCHASE_CONFIRMATION", to: "a@b.com" }),
    { sent: false, reason: "payload_required" },
  );

  const payload = {
    planType: "pro",
    amountInCents: 4990,
    currency: "BRL",
    credits: 5,
    analysisCredits: 5,
    isUnlimited: false,
    isCouponRedemption: false,
  };
  const result = await f.service.sendTest({
    kind: "PURCHASE_CONFIRMATION",
    to: "a@b.com",
    payload,
  });
  assert.equal(result.sent, true);
  assert.equal(f.emailDispatch.rows[0].kind, "PURCHASE_CONFIRMATION");
  assert.deepEqual(f.emailDispatch.rows[0].payloadJson, payload);
});
