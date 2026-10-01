import assert from "node:assert/strict";
import { test } from "node:test";

import { baseUser, createFixture, NOW } from "./email-dispatch.fixtures";
import { adjustToFeedbackWindow } from "./email-dispatch-schedule.util";

const LIVE = { EMAIL_WELCOME_MODE: "LIVE", EMAIL_FEEDBACK_MODE: "LIVE" };
const HOUR = 3_600_000;

test("tick never runs under NODE_ENV=test", async () => {
  const f = createFixture({ env: LIVE, production: true });
  await f.addDispatch();
  let called = false;
  f.worker.processBatch = async () => {
    called = true;
    return 0;
  };

  await f.worker.tick();

  assert.equal(called, false);
});

test("both kinds OFF: no lock, no database access, nothing sent", async () => {
  const f = createFixture({ production: true });
  await f.addDispatch();

  assert.equal(await f.worker.processBatch(NOW), 0);
  assert.equal(f.lockAcquisitions(), 0);
  assert.equal(f.sent.length, 0);
  assert.equal(f.emailDispatch.rows[0].status, "PENDING");
});

test("LIVE: due welcome is claimed, sent once through RELATIONSHIP and recorded SENT", async () => {
  const f = createFixture({ env: LIVE, production: true });
  const row = await f.addDispatch();

  assert.equal(await f.worker.processBatch(NOW), 1);

  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].category, "RELATIONSHIP");
  const saved = f.emailDispatch.rows.find((r) => r.id === row.id);
  assert.equal(saved.status, "SENT");
  assert.equal(saved.providerMessageId, "ses-msg-1");
  assert.ok(saved.sentAt);

  // Segunda rodada: nada novo, nada reenviado.
  await f.worker.processBatch(NOW);
  assert.equal(f.sent.length, 1);
});

test("rows scheduled in the future are not touched", async () => {
  const f = createFixture({ env: LIVE, production: true });
  await f.addDispatch({ scheduledFor: new Date(NOW.getTime() + HOUR) });

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  assert.equal(f.emailDispatch.rows[0].status, "PENDING");
});

test("SHADOW: evaluates and renders everything but NEVER sends; closes SKIPPED shadow_mode", async () => {
  const f = createFixture({
    env: { EMAIL_FEEDBACK_MODE: "SHADOW" },
    production: true,
  });
  await f.addDispatch({
    kind: "FEEDBACK_FIRST_USE",
    dedupeKey: "feedback:user_1",
  });

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  assert.equal(f.emailDispatch.rows[0].status, "SKIPPED");
  assert.equal(f.emailDispatch.rows[0].skippedReason, "shadow_mode");
});

test("SHADOW runs even when send infra is incomplete (it never sends)", async () => {
  const f = createFixture({
    env: { EMAIL_WELCOME_MODE: "SHADOW", SES_EMAIL_ENABLED: false },
    production: true,
  });
  await f.addDispatch();

  await f.worker.processBatch(NOW);

  assert.equal(f.emailDispatch.rows[0].skippedReason, "shadow_mode");
});

function allowlistFixture(production: boolean) {
  const f = createFixture({
    env: {
      EMAIL_WELCOME_MODE: "ALLOWLIST",
      EMAIL_RELATIONSHIP_ALLOWLIST: "tester@example.com",
    },
    production,
    users: [
      baseUser({ id: "user_1", email: "maria@example.com" }),
      baseUser({ id: "user_2", email: "Tester@Example.com" }),
    ],
  });
  return f;
}

async function seedAllowlistRows(f: ReturnType<typeof allowlistFixture>) {
  await f.addDispatch({ userId: "user_1", dedupeKey: "welcome:user_1" });
  await f.addDispatch({
    userId: "user_2",
    recipientEmail: "tester@example.com",
    dedupeKey: "welcome:user_2",
  });
}

const byUser = (f: ReturnType<typeof allowlistFixture>, id: string) =>
  f.emailDispatch.rows.find((r) => r.userId === id);

test("production ALLOWLIST: only allowlisted recipients are sent for real; others close SKIPPED not_allowlisted", async () => {
  const f = allowlistFixture(true);
  await seedAllowlistRows(f);

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].message.to, "Tester@Example.com");
  assert.equal(byUser(f, "user_1").skippedReason, "not_allowlisted");
  assert.equal(byUser(f, "user_2").status, "SENT");
  assert.equal(byUser(f, "user_2").providerMessageId, "ses-msg-1");
});

test("NON-production ALLOWLIST uses the FAKE transport: the allowed row is SENT with a fake id and NOTHING leaves", async () => {
  const f = allowlistFixture(false);
  await seedAllowlistRows(f);

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  assert.equal(byUser(f, "user_1").skippedReason, "not_allowlisted");
  assert.equal(byUser(f, "user_2").status, "SENT");
  assert.equal(byUser(f, "user_2").providerMessageId.startsWith("fake:"), true);
});

test("outside production a configured LIVE behaves as ALLOWLIST — dev never sends to the base", async () => {
  const f = createFixture({ env: LIVE }); // production: false
  await f.addDispatch();

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  assert.equal(f.emailDispatch.rows[0].skippedReason, "not_allowlisted");
});

test("eligibility is RE-EVALUATED at send time (unsubscribed / suppressed / blocked after scheduling)", async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [
      { relationshipEmailPreference: { subscribed: false } },
      "relationship_unsubscribed",
    ],
    [{ emailVerifiedAt: null }, "email_unverified"],
    [{ email: "paulo.alozen@gmail.com" }, "blocklisted"],
    [{ status: "suspended" }, "user_inactive"],
    [{ isStaff: true }, "staff_user"],
  ];

  for (const [overrides, reason] of cases) {
    const f = createFixture({
      env: LIVE,
      production: true,
      users: [baseUser(overrides)],
    });
    await f.addDispatch();

    await f.worker.processBatch(NOW);

    assert.equal(f.sent.length, 0, reason);
    assert.equal(f.emailDispatch.rows[0].status, "SKIPPED", reason);
    assert.equal(f.emailDispatch.rows[0].skippedReason, reason);
  }
});

test("hard bounce/complaint recorded by ANY category blocks the relationship send", async () => {
  const f = createFixture({ env: LIVE, production: true });
  await f.emailSuppression.create({
    data: { email: "maria@example.com", reason: "HARD_BOUNCE" },
  });
  await f.addDispatch();

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  assert.equal(f.emailDispatch.rows[0].skippedReason, "suppressed_hard_bounce");
});

test("expired rows become CANCELLED 'expired' and are never sent", async () => {
  const f = createFixture({ env: LIVE, production: true });
  await f.addDispatch({ expiresAt: new Date(NOW.getTime() - 1) });

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  assert.equal(f.emailDispatch.rows[0].status, "CANCELLED");
  assert.equal(f.emailDispatch.rows[0].skippedReason, "expired");
});

test("infra not ready (LIVE): nothing is sent, nothing is consumed — rows wait until they expire", async () => {
  const f = createFixture({
    env: {
      ...LIVE,
      AWS_SES_RELATIONSHIP_CONFIGURATION_SET: "earlycv-bulk-email",
    },
    production: true,
  });
  await f.addDispatch();

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  assert.equal(f.emailDispatch.rows[0].status, "PENDING");
  assert.equal(f.emailDispatch.rows[0].attempts, 0);

  // ...e não ficam pendentes para sempre:
  await f.worker.processBatch(new Date(NOW.getTime() + 25 * HOUR));
  assert.equal(f.emailDispatch.rows[0].status, "CANCELLED");
});

// ---- Feedback: janela de horário, boas-vindas, descarte -----------------

const feedbackRow = (overrides: Record<string, unknown> = {}) => ({
  kind: "FEEDBACK_FIRST_USE",
  dedupeKey: "feedback:user_1",
  ...overrides,
});

test("feedback outside 08:00–20:00 Brasília is DEFERRED to the next 08:00, not sent, not discarded", async () => {
  const f = createFixture({ env: LIVE, production: true });
  const night = new Date("2026-10-06T02:00:00.000Z"); // 23:00 BRT
  await f.addDispatch(
    feedbackRow({
      scheduledFor: new Date(night.getTime() - 60_000),
      expiresAt: new Date(night.getTime() + 48 * HOUR),
    }),
  );

  await f.worker.processBatch(night);

  assert.equal(f.sent.length, 0);
  const row = f.emailDispatch.rows[0];
  assert.equal(row.status, "PENDING");
  assert.equal(row.scheduledFor.toISOString(), "2026-10-06T11:00:00.000Z");

  // No próximo 08:00 BRT ele sai.
  await f.worker.processBatch(new Date("2026-10-06T11:00:00.000Z"));
  assert.equal(f.sent.length, 1);
  assert.equal(f.emailDispatch.rows[0].status, "SENT");
});

test("feedback whose deferral would pass its expiry is CANCELLED with an explicit reason", async () => {
  const f = createFixture({ env: LIVE, production: true });
  const night = new Date("2026-10-06T02:00:00.000Z"); // próximo 08:00 BRT = 11:00Z
  await f.addDispatch(
    feedbackRow({
      scheduledFor: new Date(night.getTime() - 60_000),
      expiresAt: new Date("2026-10-06T10:00:00.000Z"), // expira antes das 08:00 BRT
    }),
  );

  await f.worker.processBatch(night);

  assert.equal(f.sent.length, 0);
  assert.equal(f.emailDispatch.rows[0].status, "CANCELLED");
  assert.equal(
    f.emailDispatch.rows[0].skippedReason,
    "outside_window_past_expiry",
  );
});

test("feedback waits while the welcome is still PENDING (never both together)", async () => {
  const f = createFixture({ env: LIVE, production: true });
  await f.addDispatch({
    kind: "WELCOME",
    dedupeKey: "welcome:user_1",
    scheduledFor: new Date(NOW.getTime() + HOUR),
  });
  await f.addDispatch(
    feedbackRow({ expiresAt: new Date(NOW.getTime() + 48 * HOUR) }),
  );

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  const feedback = f.emailDispatch.rows.find(
    (r) => r.kind === "FEEDBACK_FIRST_USE",
  );
  assert.equal(feedback.status, "PENDING");
  assert.ok(feedback.scheduledFor > NOW);
});

test("feedback waits until 12h after a welcome that was just sent; sends after that", async () => {
  const f = createFixture({ env: LIVE, production: true });
  await f.addDispatch({
    kind: "WELCOME",
    dedupeKey: "welcome:user_1",
    status: "SENT",
    sentAt: new Date(NOW.getTime() - 2 * HOUR),
  });
  await f.addDispatch(
    feedbackRow({ expiresAt: new Date(NOW.getTime() + 48 * HOUR) }),
  );

  await f.worker.processBatch(NOW);
  assert.equal(f.sent.length, 0);
  const feedback = f.emailDispatch.rows.find(
    (r) => r.kind === "FEEDBACK_FIRST_USE",
  );
  assert.equal(feedback.status, "PENDING");
  // welcome + 12h = 05/10 25:00Z -> 06/10 01:00Z = 22:00 BRT -> próximo 08:00 BRT
  assert.equal(feedback.scheduledFor.toISOString(), "2026-10-06T11:00:00.000Z");

  await f.worker.processBatch(new Date("2026-10-06T11:00:00.000Z"));
  assert.equal(f.sent.length, 1);
});

test("feedback is sent immediately when the welcome was sent long ago", async () => {
  const f = createFixture({ env: LIVE, production: true });
  await f.addDispatch({
    kind: "WELCOME",
    dedupeKey: "welcome:user_1",
    status: "SENT",
    sentAt: new Date(NOW.getTime() - 20 * HOUR),
  });
  await f.addDispatch(feedbackRow());

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 1);
});

test("feedback is DISCARDED (SKIPPED) — not deferred — when the user became ineligible", async () => {
  const f = createFixture({
    env: LIVE,
    production: true,
    users: [baseUser({ relationshipEmailPreference: { subscribed: false } })],
  });
  await f.addDispatch(feedbackRow());

  await f.worker.processBatch(NOW);

  assert.equal(f.emailDispatch.rows[0].status, "SKIPPED");
  assert.equal(
    f.emailDispatch.rows[0].skippedReason,
    "relationship_unsubscribed",
  );
});

test("feedback always sends the single feedback template (no per-user variant)", async () => {
  const f = createFixture({ env: LIVE, production: true });
  await f.addDispatch(feedbackRow());

  await f.worker.processBatch(NOW);

  assert.equal(f.sent[0].message.subject, "Sobre a análise do seu currículo");
  assert.equal(f.emailDispatch.rows[0].status, "SENT");
});

// ---- Feedback segunda chamada (14 dias depois do ENVIO do primeiro) ------

const DAY = 24 * HOUR;
const BOTH_FEEDBACKS = {
  EMAIL_FEEDBACK_MODE: "LIVE",
  EMAIL_FEEDBACK_SECOND_CALL_MODE: "LIVE",
};
const secondCallRow = (overrides: Record<string, unknown> = {}) => ({
  kind: "FEEDBACK_SECOND_CALL",
  dedupeKey: "feedback2:user_1",
  ...overrides,
});

test("second call: created only when the first feedback is really SENT, 14 days after sentAt, inside the 08–20h window, expiring in 48h", async () => {
  const f = createFixture({ env: BOTH_FEEDBACKS, production: true });
  await f.addDispatch(feedbackRow());

  await f.worker.processBatch(NOW);

  const first = f.emailDispatch.rows.find(
    (r) => r.kind === "FEEDBACK_FIRST_USE",
  );
  assert.equal(first.status, "SENT");
  const second = f.emailDispatch.rows.find(
    (r) => r.kind === "FEEDBACK_SECOND_CALL",
  );
  assert.ok(second);
  assert.equal(second.dedupeKey, "feedback2:user_1");
  assert.equal(second.userId, "user_1");
  assert.equal(second.recipientEmail, first.recipientEmail);
  assert.equal(second.status, "PENDING");
  assert.equal(
    second.scheduledFor.toISOString(),
    adjustToFeedbackWindow(
      new Date(first.sentAt.getTime() + 14 * DAY),
    ).toISOString(),
  );
  assert.ok(second.scheduledFor.getTime() >= first.sentAt.getTime() + 14 * DAY);
  assert.equal(
    second.expiresAt.getTime() - second.scheduledFor.getTime(),
    48 * HOUR,
  );
});

test("second call is NOT created when its mode is OFF, when the first was only SHADOW, or when the first was skipped", async () => {
  const off = createFixture({
    env: { EMAIL_FEEDBACK_MODE: "LIVE" },
    production: true,
  });
  await off.addDispatch(feedbackRow());
  await off.worker.processBatch(NOW);
  assert.equal(off.emailDispatch.rows.length, 1);

  const shadow = createFixture({
    env: { ...BOTH_FEEDBACKS, EMAIL_FEEDBACK_MODE: "SHADOW" },
    production: true,
  });
  await shadow.addDispatch(feedbackRow());
  await shadow.worker.processBatch(NOW);
  assert.equal(shadow.emailDispatch.rows[0].status, "SKIPPED");
  assert.equal(shadow.emailDispatch.rows.length, 1);

  const unsubscribed = createFixture({
    env: BOTH_FEEDBACKS,
    production: true,
    users: [baseUser({ relationshipEmailPreference: { subscribed: false } })],
  });
  await unsubscribed.addDispatch(feedbackRow());
  await unsubscribed.worker.processBatch(NOW);
  assert.equal(unsubscribed.emailDispatch.rows[0].status, "SKIPPED");
  assert.equal(unsubscribed.emailDispatch.rows.length, 1);
});

test("second call creation is idempotent (dedupe feedback2:{userId})", async () => {
  const f = createFixture({ env: BOTH_FEEDBACKS, production: true });
  await f.addDispatch(secondCallRow({ status: "CANCELLED" }));
  await f.addDispatch(feedbackRow());

  await f.worker.processBatch(NOW);

  assert.equal(
    f.emailDispatch.rows.filter((r) => r.kind === "FEEDBACK_SECOND_CALL")
      .length,
    1,
  );
});

test("second call: due row is sent with ITS template and recorded SENT; it never creates another round", async () => {
  const f = createFixture({ env: BOTH_FEEDBACKS, production: true });
  await f.addDispatch(secondCallRow());

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].category, "RELATIONSHIP");
  assert.equal(
    f.sent[0].message.subject,
    "Sua primeira experiência no EarlyCV",
  );
  assert.equal(f.emailDispatch.rows[0].status, "SENT");
  assert.equal(f.emailDispatch.rows.length, 1);
});

test("second call follows its OWN mode: OFF leaves it untouched, SHADOW never sends, ALLOWLIST filters", async () => {
  const off = createFixture({
    env: { EMAIL_FEEDBACK_MODE: "LIVE" },
    production: true,
  });
  await off.addDispatch(secondCallRow());
  await off.worker.processBatch(NOW);
  assert.equal(off.sent.length, 0);
  assert.equal(off.emailDispatch.rows[0].status, "PENDING");

  const shadow = createFixture({
    env: { EMAIL_FEEDBACK_SECOND_CALL_MODE: "SHADOW" },
    production: true,
  });
  await shadow.addDispatch(secondCallRow());
  await shadow.worker.processBatch(NOW);
  assert.equal(shadow.sent.length, 0);
  assert.equal(shadow.emailDispatch.rows[0].skippedReason, "shadow_mode");

  const allowlist = createFixture({
    env: {
      EMAIL_FEEDBACK_SECOND_CALL_MODE: "ALLOWLIST",
      EMAIL_RELATIONSHIP_ALLOWLIST: "other@example.com",
    },
    production: true,
  });
  await allowlist.addDispatch(secondCallRow());
  await allowlist.worker.processBatch(NOW);
  assert.equal(allowlist.sent.length, 0);
  assert.equal(
    allowlist.emailDispatch.rows[0].skippedReason,
    "not_allowlisted",
  );
});

test("second call keeps the eligibility rules: unsubscribed users are skipped", async () => {
  const f = createFixture({
    env: BOTH_FEEDBACKS,
    production: true,
    users: [baseUser({ relationshipEmailPreference: { subscribed: false } })],
  });
  await f.addDispatch(secondCallRow());

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  assert.equal(
    f.emailDispatch.rows[0].skippedReason,
    "relationship_unsubscribed",
  );
});

test("second call outside 08:00–20:00 Brasília is deferred to the next 08:00; a pending welcome does NOT hold it back", async () => {
  const f = createFixture({ env: BOTH_FEEDBACKS, production: true });
  const night = new Date("2026-10-06T02:00:00.000Z"); // 23:00 BRT
  await f.addDispatch({
    kind: "WELCOME",
    dedupeKey: "welcome:user_1",
    scheduledFor: new Date(night.getTime() + 30 * DAY),
  });
  await f.addDispatch(
    secondCallRow({
      scheduledFor: new Date(night.getTime() - 60_000),
      expiresAt: new Date(night.getTime() + 48 * HOUR),
    }),
  );

  await f.worker.processBatch(night);
  const row = f.emailDispatch.rows.find(
    (r) => r.kind === "FEEDBACK_SECOND_CALL",
  );
  assert.equal(f.sent.length, 0);
  assert.equal(row.status, "PENDING");
  assert.equal(row.scheduledFor.toISOString(), "2026-10-06T11:00:00.000Z");

  await f.worker.processBatch(new Date("2026-10-06T11:00:00.000Z"));
  assert.equal(f.sent.length, 1);
  assert.equal(
    f.emailDispatch.rows.find((r) => r.kind === "FEEDBACK_SECOND_CALL").status,
    "SENT",
  );
});

test("a failure while creating the second call never undoes or fails the first feedback", async () => {
  const f = createFixture({ env: BOTH_FEEDBACKS, production: true });
  await f.addDispatch(feedbackRow());
  f.emailDispatch.createMany = async () => {
    throw new Error("db down");
  };

  await f.worker.processBatch(NOW);

  assert.equal(f.emailDispatch.rows[0].status, "SENT");
  assert.equal(f.sent.length, 1);
});

// ---- Claim atômico, OUTCOME_UNKNOWN, tentativas -------------------------

test("atomic claim: if another worker already took the row (claim count 0) nothing is sent", async () => {
  const f = createFixture({ env: LIVE, production: true });
  await f.addDispatch();
  const original = f.emailDispatch.updateMany.bind(f.emailDispatch);
  f.emailDispatch.updateMany = async (args) =>
    args.data.status === "PROCESSING" ? { count: 0 } : original(args);

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  assert.equal(f.emailDispatch.rows[0].status, "PENDING");
});

test("two concurrent worker runs send a due row exactly once", async () => {
  const f = createFixture({ env: LIVE, production: true });
  await f.addDispatch();

  await Promise.all([f.worker.processBatch(NOW), f.worker.processBatch(NOW)]);

  assert.equal(f.sent.length, 1);
  assert.equal(f.emailDispatch.rows[0].status, "SENT");
});

test("stale PROCESSING becomes OUTCOME_UNKNOWN and is NEVER re-sent", async () => {
  const f = createFixture({ env: LIVE, production: true });
  const row = await f.addDispatch({ status: "PROCESSING" });
  f.emailDispatch.rows[0].updatedAt = new Date(Date.now() - 30 * 60_000);

  await f.worker.processBatch(new Date());

  assert.equal(f.sent.length, 0);
  const saved = f.emailDispatch.rows.find((r) => r.id === row.id);
  assert.equal(saved.status, "OUTCOME_UNKNOWN");
  assert.ok(saved.outcomeUnknownAt);
});

test("a fresh PROCESSING row (another worker mid-send) is left alone", async () => {
  const f = createFixture({ env: LIVE, production: true });
  await f.addDispatch({ status: "PROCESSING" });

  await f.worker.processBatch(new Date());

  assert.equal(f.emailDispatch.rows[0].status, "PROCESSING");
  assert.equal(f.sent.length, 0);
});

test("provider OUTCOME_UNKNOWN is recorded and never retried", async () => {
  const f = createFixture({
    env: LIVE,
    production: true,
    sendResults: [
      {
        outcome: "OUTCOME_UNKNOWN",
        provider: "SES",
        providerMessageId: null,
        errorMessage: "timeout",
      },
    ],
  });
  await f.addDispatch();

  await f.worker.processBatch(NOW);
  await f.worker.processBatch(new Date(NOW.getTime() + HOUR));

  assert.equal(f.sent.length, 1);
  assert.equal(f.emailDispatch.rows[0].status, "OUTCOME_UNKNOWN");
  assert.equal(f.emailDispatch.rows[0].lastError, "timeout");
});

test("confirmed provider FAILED retries with backoff, then becomes FAILED after the 3rd attempt", async () => {
  const failed = {
    outcome: "FAILED" as const,
    provider: "SES" as const,
    providerMessageId: null,
    errorMessage: "rejected",
  };
  const f = createFixture({
    env: LIVE,
    production: true,
    sendResults: [failed, failed, failed],
  });
  await f.addDispatch();

  await f.worker.processBatch(NOW);
  let row = f.emailDispatch.rows[0];
  assert.equal(row.status, "PENDING");
  assert.equal(row.attempts, 1);
  assert.equal(row.scheduledFor.toISOString(), "2026-10-05T15:15:00.000Z");

  // Antes do backoff vencer: nada.
  await f.worker.processBatch(new Date(NOW.getTime() + 60_000));
  assert.equal(f.sent.length, 1);

  await f.worker.processBatch(new Date("2026-10-05T15:15:00.000Z"));
  row = f.emailDispatch.rows[0];
  assert.equal(row.attempts, 2);
  assert.equal(row.status, "PENDING");

  await f.worker.processBatch(new Date("2026-10-05T16:00:00.000Z"));
  row = f.emailDispatch.rows[0];
  assert.equal(row.attempts, 3);
  assert.equal(row.status, "FAILED");
  assert.equal(f.sent.length, 3);

  await f.worker.processBatch(new Date("2026-10-06T16:00:00.000Z"));
  assert.equal(f.sent.length, 3); // terminal: nunca mais
});

test("unexpected error BEFORE the provider call goes back to PENDING (nothing was sent)", async () => {
  const f = createFixture({ env: LIVE, production: true });
  await f.addDispatch();
  f.database.user.findUnique = async () => {
    throw new Error("db blip");
  };

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  assert.equal(f.emailDispatch.rows[0].status, "PENDING");
  assert.equal(f.emailDispatch.rows[0].attempts, 1);
});

test("exception DURING the provider call becomes OUTCOME_UNKNOWN (never retried)", async () => {
  const f = createFixture({
    env: LIVE,
    production: true,
    sendResults: [
      () => {
        throw new Error("socket hang up");
      },
    ],
  });
  await f.addDispatch();

  await f.worker.processBatch(NOW);
  await f.worker.processBatch(new Date(NOW.getTime() + HOUR));

  assert.equal(f.sent.length, 1);
  assert.equal(f.emailDispatch.rows[0].status, "OUTCOME_UNKNOWN");
  assert.equal(f.emailDispatch.rows[0].lastError, "socket hang up");
});
