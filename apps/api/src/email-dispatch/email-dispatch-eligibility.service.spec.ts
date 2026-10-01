import assert from "node:assert/strict";
import { test } from "node:test";

import { baseUser, createFixture } from "./email-dispatch.fixtures";

const live = { EMAIL_WELCOME_MODE: "LIVE", EMAIL_FEEDBACK_MODE: "LIVE" };

async function reasonFor(userOverrides: Record<string, unknown> | null) {
  const f = createFixture({
    env: live,
    production: true,
    users: userOverrides === null ? [] : [baseUser(userOverrides)],
  });
  return f.eligibility.evaluate({ userId: "user_1" });
}

test("eligible: active, verified, new, no suppression, subscribed by default", async () => {
  const result = await reasonFor({});
  assert.deepEqual(result, {
    eligible: true,
    user: { id: "user_1", email: "maria@example.com", name: "Maria Souza" },
  });
});

test("every business rule discards with an explicit reason", async () => {
  const cases: Array<[Record<string, unknown> | null, string]> = [
    [null, "user_not_found"],
    [{ status: "suspended" }, "user_inactive"],
    [{ emailVerifiedAt: null }, "email_unverified"],
    [{ isStaff: true }, "staff_user"],
    [{ internalRole: "admin" }, "staff_user"],
    [{ email: "paulo.alozen@gmail.com" }, "blocklisted"],
    [{ email: "contato@earlycv.com.br" }, "blocklisted"],
    [{ createdAt: new Date("2026-09-30T23:59:59.000Z") }, "before_cutoff"],
    [
      { relationshipEmailPreference: { subscribed: false } },
      "relationship_unsubscribed",
    ],
    [
      { monitorAlertPreference: { suppressionReason: "COMPLAINED" } },
      "suppressed_complaint",
    ],
    [
      { productEmailSubscription: { suppressionReason: "COMPLAINED" } },
      "suppressed_complaint",
    ],
  ];

  for (const [overrides, reason] of cases) {
    assert.deepEqual(
      await reasonFor(overrides),
      { eligible: false, reason },
      reason,
    );
  }
});

test("a null userId (no user) is never eligible", async () => {
  const f = createFixture();
  assert.deepEqual(await f.eligibility.evaluate({ userId: null }), {
    eligible: false,
    reason: "no_user",
  });
});

test("unsubscribing from Product Updates does NOT make relationship ineligible", async () => {
  const result = await reasonFor({
    productEmailSubscription: {
      subscribed: false,
      suppressionReason: "SES_OPT_OUT",
    },
  });
  assert.equal(result.eligible, true);
});

test("legacy BOUNCED is not read (cannot tell transient from hard) — only the shared table blocks bounces", async () => {
  const legacy = await reasonFor({
    monitorAlertPreference: { suppressionReason: "BOUNCED" },
    productEmailSubscription: { suppressionReason: "BOUNCED" },
  });
  assert.equal(legacy.eligible, true);

  const f = createFixture({ env: live, production: true });
  await f.emailSuppression.create({
    data: { email: "maria@example.com", reason: "HARD_BOUNCE" },
  });
  assert.deepEqual(await f.eligibility.evaluate({ userId: "user_1" }), {
    eligible: false,
    reason: "suppressed_hard_bounce",
  });
});

test("shared complaint suppression blocks regardless of which category generated it", async () => {
  const f = createFixture({ env: live, production: true });
  await f.emailSuppression.create({
    data: { email: "maria@example.com", reason: "COMPLAINT" },
  });
  assert.deepEqual(await f.eligibility.evaluate({ userId: "user_1" }), {
    eligible: false,
    reason: "suppressed_complaint",
  });
});
