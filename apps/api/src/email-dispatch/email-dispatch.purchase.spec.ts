import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { baseUser, createFixture, NOW } from "./email-dispatch.fixtures";
import type { Row } from "./email-dispatch.test-support";

const LIVE = { EMAIL_PURCHASE_CONFIRMATION_MODE: "LIVE" };
const PURCHASE_ID = "purchase_1";

let originalResendKey: string | undefined;
beforeEach(() => {
  originalResendKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
});
afterEach(() => {
  if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalResendKey;
});

const PAID_PAYLOAD = {
  planType: "pro",
  amountInCents: 4990,
  currency: "BRL",
  credits: 5,
  analysisCredits: 5,
  isUnlimited: false,
  isCouponRedemption: false,
};

function purchase(overrides: Row = {}): Row {
  return {
    id: PURCHASE_ID,
    userId: "user_1",
    status: "completed",
    createdAt: new Date("2026-10-04T12:00:00.000Z"), // depois do cutoff
    ...overrides,
  };
}

async function addPurchaseDispatch(
  f: ReturnType<typeof createFixture>,
  overrides: Row = {},
) {
  return f.addDispatch({
    kind: "PURCHASE_CONFIRMATION",
    dedupeKey: `purchase:${PURCHASE_ID}`,
    referenceId: PURCHASE_ID,
    payloadJson: PAID_PAYLOAD,
    ...overrides,
  });
}

// ---- Enqueue transacional (savepoint) -------------------------------------

function createFakeTx(
  options: {
    purchase?: Row | null;
    user?: Row | null;
    failOn?: "savepoint" | "createMany";
  } = {},
) {
  const statements: string[] = [];
  const rows: Row[] = [];
  const tx = {
    $executeRawUnsafe: async (sql: string) => {
      statements.push(sql);
      if (options.failOn === "savepoint" && sql.startsWith("SAVEPOINT")) {
        throw new Error("savepoint failed");
      }
      return 0;
    },
    planPurchase: {
      findUnique: async () =>
        options.purchase === undefined
          ? {
              planType: "pro",
              amountInCents: 4990,
              currency: "BRL",
              paymentProvider: "mercadopago",
              createdAt: new Date("2026-10-04T12:00:00.000Z"),
            }
          : options.purchase,
    },
    user: {
      findUnique: async () =>
        options.user === undefined
          ? { email: "maria@example.com" }
          : options.user,
    },
    emailDispatch: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Row[];
        skipDuplicates?: boolean;
      }) => {
        if (options.failOn === "createMany") {
          throw new Error("relation EmailDispatch does not exist");
        }
        for (const row of data) {
          const duplicate = rows.some((r) => r.dedupeKey === row.dedupeKey);
          if (duplicate && !skipDuplicates) throw new Error("unique");
          if (!duplicate) rows.push(row);
        }
        return { count: data.length };
      },
    },
  };
  return { tx: tx as never, statements, rows };
}

const ENQUEUE_INPUT = {
  purchaseId: PURCHASE_ID,
  userId: "user_1",
  creditsApplied: 5,
  analysisCreditsApplied: 5,
  isUnlimited: false,
};

test("enqueue: mode OFF (default) has ZERO footprint — no savepoint, no queries", async () => {
  const f = createFixture({ production: true });
  const { tx, statements, rows } = createFakeTx();

  const queued = await f.service.enqueuePurchaseConfirmationInTransaction(
    tx,
    ENQUEUE_INPUT,
  );

  assert.equal(queued, false);
  assert.deepEqual(statements, []);
  assert.equal(rows.length, 0);
});

test("enqueue: creates exactly one row per purchase with the frozen snapshot, inside a savepoint that is released", async () => {
  const f = createFixture({ env: LIVE, production: true });
  const { tx, statements, rows } = createFakeTx();
  const now = new Date("2026-10-05T15:00:00.000Z");

  assert.equal(
    await f.service.enqueuePurchaseConfirmationInTransaction(
      tx,
      ENQUEUE_INPUT,
      now,
    ),
    true,
  );
  // reentrega / segundo caminho de aprovação: continua 1 linha
  await f.service.enqueuePurchaseConfirmationInTransaction(
    tx,
    ENQUEUE_INPUT,
    now,
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "PURCHASE_CONFIRMATION");
  assert.equal(rows[0].dedupeKey, "purchase:purchase_1");
  assert.equal(rows[0].referenceId, PURCHASE_ID);
  assert.equal(rows[0].recipientEmail, "maria@example.com");
  assert.equal(rows[0].expiresAt.getTime() - now.getTime(), 24 * 3_600_000);
  assert.deepEqual(rows[0].payloadJson, PAID_PAYLOAD);
  assert.equal(statements[0], "SAVEPOINT email_dispatch_enqueue");
  assert.equal(statements[1], "RELEASE SAVEPOINT email_dispatch_enqueue");
});

test("enqueue: a 100% coupon (internal_coupon, amount 0) is marked as redemption — never as a payment", async () => {
  const f = createFixture({ env: LIVE, production: true });
  const { tx, rows } = createFakeTx({
    purchase: {
      planType: "starter",
      amountInCents: 0,
      currency: "BRL",
      paymentProvider: "internal_coupon",
      createdAt: new Date("2026-10-04T12:00:00.000Z"),
    },
  });

  await f.service.enqueuePurchaseConfirmationInTransaction(tx, ENQUEUE_INPUT);

  assert.equal(rows[0].payloadJson.isCouponRedemption, true);
  assert.equal(rows[0].payloadJson.amountInCents, 0);
});

test("enqueue: unlimited plan is flagged and credits are what was actually applied", async () => {
  const f = createFixture({ env: LIVE, production: true });
  const { tx, rows } = createFakeTx();

  await f.service.enqueuePurchaseConfirmationInTransaction(tx, {
    ...ENQUEUE_INPUT,
    creditsApplied: 0,
    analysisCreditsApplied: 0,
    isUnlimited: true,
  });

  assert.equal(rows[0].payloadJson.isUnlimited, true);
});

test("enqueue: purchases created before the cutoff never generate an e-mail (reconciliation/repair of old purchases)", async () => {
  const f = createFixture({ env: LIVE, production: true });
  const { tx, statements, rows } = createFakeTx({
    purchase: {
      planType: "pro",
      amountInCents: 4990,
      currency: "BRL",
      paymentProvider: "mercadopago",
      createdAt: new Date("2026-09-20T12:00:00.000Z"),
    },
  });

  assert.equal(
    await f.service.enqueuePurchaseConfirmationInTransaction(tx, ENQUEUE_INPUT),
    false,
  );
  assert.equal(rows.length, 0);
  assert.equal(statements.at(-1), "RELEASE SAVEPOINT email_dispatch_enqueue");
});

test("enqueue: a failing insert is absorbed by ROLLBACK TO SAVEPOINT and NEVER throws — credits are unaffected", async () => {
  const f = createFixture({ env: LIVE, production: true });
  const { tx, statements } = createFakeTx({ failOn: "createMany" });

  const queued = await f.service.enqueuePurchaseConfirmationInTransaction(
    tx,
    ENQUEUE_INPUT,
  );

  assert.equal(queued, false);
  assert.deepEqual(statements, [
    "SAVEPOINT email_dispatch_enqueue",
    "ROLLBACK TO SAVEPOINT email_dispatch_enqueue",
  ]);
});

test("enqueue: if even the SAVEPOINT fails it returns false without throwing and without a bogus rollback", async () => {
  const f = createFixture({ env: LIVE, production: true });
  const { tx, statements } = createFakeTx({ failOn: "savepoint" });

  assert.equal(
    await f.service.enqueuePurchaseConfirmationInTransaction(tx, ENQUEUE_INPUT),
    false,
  );
  assert.deepEqual(statements, ["SAVEPOINT email_dispatch_enqueue"]);
});

test("enqueue: missing purchase or user is a safe no-op", async () => {
  const f = createFixture({ env: LIVE, production: true });
  for (const options of [{ purchase: null }, { user: null }]) {
    const { tx, rows } = createFakeTx(options);
    assert.equal(
      await f.service.enqueuePurchaseConfirmationInTransaction(
        tx,
        ENQUEUE_INPUT,
      ),
      false,
    );
    assert.equal(rows.length, 0);
  }
});

// ---- Worker / elegibilidade ------------------------------------------------

test("worker LIVE: sends through BILLING (Resend), no list-management/unsubscribe, to the buyer, with the frozen amounts", async () => {
  const f = createFixture({
    env: LIVE,
    production: true,
    purchases: [purchase()],
  });
  await addPurchaseDispatch(f);

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 1);
  const { category, message } = f.sent[0];
  assert.equal(category, "BILLING");
  assert.equal(message.to, "maria@example.com");
  assert.equal(message.subject, "Confirmação da sua compra no EarlyCV");
  assert.match(message.text, /Valor pago: R\$\s?49,90/);
  assert.equal(message.listManagementOptions, undefined);
  assert.doesNotMatch(message.text, /amazonSES/);
  assert.equal(f.emailDispatch.rows[0].status, "SENT");

  await f.worker.processBatch(NOW);
  assert.equal(f.sent.length, 1); // nunca duas vezes
});

test("worker LIVE: 100% coupon sends the redemption e-mail without claiming payment", async () => {
  const f = createFixture({
    env: LIVE,
    production: true,
    purchases: [purchase()],
  });
  await addPurchaseDispatch(f, {
    payloadJson: {
      ...PAID_PAYLOAD,
      amountInCents: 0,
      isCouponRedemption: true,
    },
  });

  await f.worker.processBatch(NOW);

  assert.equal(f.sent[0].message.subject, "Seu cupom foi resgatado no EarlyCV");
  assert.doesNotMatch(
    f.sent[0].message.text,
    /pagamento da sua compra|Valor pago/,
  );
});

test("receipt is a transaction notice: unverified e-mail, relationship opt-out, blocklisted account and staff do NOT stop it", async () => {
  const f = createFixture({
    env: LIVE,
    production: true,
    purchases: [purchase()],
    users: [
      baseUser({
        emailVerifiedAt: null,
        relationshipEmailPreference: { subscribed: false },
        email: "paulo.alozen@gmail.com",
        isStaff: true,
      }),
    ],
  });
  await addPurchaseDispatch(f);

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 1);
  assert.equal(f.emailDispatch.rows[0].status, "SENT");
});

test("receipt is discarded (SKIPPED) when the purchase is not completed anymore, belongs to someone else, predates the cutoff, or the address is suppressed", async () => {
  const cases: Array<
    [
      Row | null,
      string,
      (f: ReturnType<typeof createFixture>) => Promise<void> | void,
    ]
  > = [
    [purchase({ status: "refunded" }), "purchase_not_completed", () => {}],
    [purchase({ userId: "other" }), "purchase_user_mismatch", () => {}],
    [
      purchase({ createdAt: new Date("2026-09-01T00:00:00.000Z") }),
      "before_cutoff",
      () => {},
    ],
    [null, "purchase_not_found", () => {}],
    [
      purchase(),
      "suppressed_hard_bounce",
      async (f) => {
        await f.emailSuppression.create({
          data: { email: "maria@example.com", reason: "HARD_BOUNCE" },
        });
      },
    ],
    [
      purchase(),
      "suppressed_complaint",
      async (f) => {
        await f.emailSuppression.create({
          data: { email: "maria@example.com", reason: "COMPLAINT" },
        });
      },
    ],
  ];

  for (const [row, reason, prepare] of cases) {
    const f = createFixture({
      env: LIVE,
      production: true,
      purchases: row ? [row] : [],
    });
    await prepare(f);
    await addPurchaseDispatch(f);

    await f.worker.processBatch(NOW);

    assert.equal(f.sent.length, 0, reason);
    assert.equal(f.emailDispatch.rows[0].status, "SKIPPED", reason);
    assert.equal(f.emailDispatch.rows[0].skippedReason, reason, reason);
  }
});

test("receipt has no feedback-style deferral: it goes out immediately, even at night", async () => {
  const f = createFixture({
    env: LIVE,
    production: true,
    purchases: [purchase()],
  });
  await addPurchaseDispatch(f);
  const night = new Date("2026-10-06T05:00:00.000Z"); // 02:00 BRT

  await f.worker.processBatch(night);

  assert.equal(f.sent.length, 1);
});

test("SHADOW: evaluates and renders, never sends; ALLOWLIST outside production uses the FAKE transport (nothing leaves)", async () => {
  const shadow = createFixture({
    env: { EMAIL_PURCHASE_CONFIRMATION_MODE: "SHADOW" },
    production: true,
    purchases: [purchase()],
  });
  await addPurchaseDispatch(shadow);
  await shadow.worker.processBatch(NOW);
  assert.equal(shadow.sent.length, 0);
  assert.equal(shadow.emailDispatch.rows[0].skippedReason, "shadow_mode");

  const allowlist = createFixture({
    env: {
      EMAIL_PURCHASE_CONFIRMATION_MODE: "ALLOWLIST",
      EMAIL_RELATIONSHIP_ALLOWLIST: "maria@example.com",
    },
    purchases: [purchase()],
  }); // production: false
  await addPurchaseDispatch(allowlist);
  await allowlist.worker.processBatch(NOW);
  assert.equal(allowlist.sent.length, 0);
  assert.equal(allowlist.emailDispatch.rows[0].status, "SENT");
  assert.equal(
    allowlist.emailDispatch.rows[0].providerMessageId.startsWith("fake:"),
    true,
  );
});

test("production ALLOWLIST sends only to allowlisted buyers", async () => {
  const f = createFixture({
    env: {
      EMAIL_PURCHASE_CONFIRMATION_MODE: "ALLOWLIST",
      EMAIL_RELATIONSHIP_ALLOWLIST: "someone.else@example.com",
    },
    production: true,
    purchases: [purchase()],
  });
  await addPurchaseDispatch(f);

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  assert.equal(f.emailDispatch.rows[0].skippedReason, "not_allowlisted");
});

test("production without RESEND_API_KEY: nothing is sent and nothing is consumed (no silent fake 'SENT')", async () => {
  delete process.env.RESEND_API_KEY;
  const f = createFixture({
    env: LIVE,
    production: true,
    purchases: [purchase()],
  });
  await addPurchaseDispatch(f);

  await f.worker.processBatch(NOW);

  assert.equal(f.sent.length, 0);
  assert.equal(f.emailDispatch.rows[0].status, "PENDING");
  assert.equal(f.emailDispatch.rows[0].attempts, 0);
});

test("a provider failure on the receipt retries and ends FAILED — it only ever affects the e-mail row", async () => {
  const failed = {
    outcome: "FAILED" as const,
    provider: "RESEND" as const,
    providerMessageId: null,
    errorMessage: "resend 500",
  };
  const f = createFixture({
    env: LIVE,
    production: true,
    purchases: [purchase()],
    sendResults: [failed, failed, failed],
  });
  await addPurchaseDispatch(f);

  await f.worker.processBatch(NOW);
  await f.worker.processBatch(new Date(NOW.getTime() + 20 * 60_000));
  await f.worker.processBatch(new Date(NOW.getTime() + 2 * 3_600_000));

  assert.equal(f.emailDispatch.rows[0].status, "FAILED");
  assert.equal(f.sent.length, 3);
});
