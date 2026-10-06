import "reflect-metadata";

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";

import {
  buildWhatsappUrl,
  canSimulateMockInterviewPayment,
  purchaseCode,
  purchaseIdFromExternalReference,
  toExternalReference,
} from "./mock-interview.config";
import {
  type BrickPaymentResult,
  checkMercadoPagoSignature,
  type NormalizedMpPayment,
  normalizeMpPayment,
} from "./mock-interview-mercadopago";
import {
  buildPurchaseView,
  MockInterviewsService,
} from "./mock-interviews.service";

type Row = Record<string, unknown> & { id: string };

// Banco em memória com só o que o serviço usa. updateMany respeita a
// condição de status — é ela que garante uma única aprovação sob
// concorrência.
function createFakeDb(initial: Row[]) {
  const purchases = new Map(initial.map((row) => [row.id, { ...row }]));
  const events: Row[] = [];
  const audits: Row[] = [];

  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, condition]) => {
      if (condition && typeof condition === "object" && "in" in condition) {
        return (condition as { in: unknown[] }).in.includes(row[key]);
      }
      return row[key] === condition;
    });

  const db = {
    purchases,
    events,
    audits,
    user: {
      findUnique: async () => ({
        id: "user-1",
        email: "maria@example.com",
        name: "Maria Souza",
      }),
    },
    jobApplication: { findFirst: async () => null },
    mockInterviewPurchase: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = purchases.get(where.id);
        return row ? { ...row } : null;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = [...purchases.values()].find((r) =>
          matches(r, { id: where.id, userId: where.userId }),
        );
        return row
          ? {
              ...row,
              user: { name: "Maria Souza", email: "maria@example.com" },
            }
          : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        // yield para simular a corrida real entre dois webhooks
        await new Promise((resolve) => setImmediate(resolve));
        let count = 0;
        for (const row of purchases.values()) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = purchases.get(where.id);
        if (row) Object.assign(row, data);
        return row;
      },
      create: async ({ data }: { data: Row }) => {
        const row = {
          ...data,
          id: "new-purchase",
          createdAt: new Date(),
        } as Row;
        purchases.set(row.id, row);
        return row;
      },
    },
    mockInterviewEvent: {
      create: async ({ data }: { data: Row }) => {
        events.push(data);
        return data;
      },
    },
    paymentAuditLog: {
      create: async ({ data }: { data: Row }) => {
        audits.push(data);
        return data;
      },
    },
  };
  return db;
}

function basePurchase(overrides: Partial<Row> = {}): Row {
  return {
    id: "cmpurchase000abc123",
    userId: "user-1",
    amountInCents: 7990,
    currency: "BRL",
    paymentStatus: "pending",
    sessionStatus: "AWAITING_SCHEDULING",
    scheduledAt: null,
    meetingUrl: null,
    mpPreferenceId: "pref-1",
    mpPaymentId: null,
    paidAt: null,
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
    ...overrides,
  };
}

function approvedPayment(
  overrides: Partial<NormalizedMpPayment> = {},
): NormalizedMpPayment {
  return {
    paymentId: "pay-1",
    status: "approved",
    rawStatus: "approved",
    statusDetail: "accredited",
    externalReference: toExternalReference("cmpurchase000abc123"),
    preferenceId: "pref-1",
    merchantOrderId: "order-1",
    paymentMethod: "pix",
    paidAmountInCents: 7990,
    paidCurrency: "BRL",
    ...overrides,
  };
}

function createService(
  db: ReturnType<typeof createFakeDb>,
  gateway: Partial<{
    getPayment: (id: string) => Promise<NormalizedMpPayment | null>;
    findLatestByExternalReference: (
      ref: string,
    ) => Promise<NormalizedMpPayment | null>;
    createBrickPayment: (input: {
      idempotencyKey: string;
      amountInCents: number;
      notificationUrl: string;
    }) => Promise<BrickPaymentResult>;
  }> = {},
) {
  const notified: string[] = [];
  const service = new MockInterviewsService(
    db as never,
    {
      getPayment: gateway.getPayment ?? (async () => approvedPayment()),
      findLatestByExternalReference:
        gateway.findLatestByExternalReference ?? (async () => null),
      createBrickPayment:
        gateway.createBrickPayment ??
        (async () => ({
          payment: approvedPayment(),
          qrCodeBase64: null,
          qrCodeText: null,
        })),
    },
    {
      notifyPurchaseApproved: async (id: string) => {
        notified.push(id);
      },
    },
  );
  return { service, notified };
}

const savedEnv = { ...process.env };
beforeEach(() => {
  delete process.env.MERCADOPAGO_PRO_WEBHOOK_SECRET;
  delete process.env.MERCADOPAGO_BRICK_WEBHOOK_SECRET;
  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  process.env.API_URL = "https://api.earlycv.test";
  process.env.MOCK_INTERVIEW_WHATSAPP_NUMBER = "+55 (11) 99999-0000";
  process.env.PRICE_INTERVIEW_SIM = "7990";
});
afterEach(() => {
  process.env = { ...savedEnv };
});

test("two concurrent approved webhooks approve the purchase exactly once and notify once", async () => {
  const db = createFakeDb([basePurchase()]);
  const { service, notified } = createService(db);
  const body = { type: "payment", data: { id: "pay-1" } };

  const results = await Promise.all([
    service.handleWebhook({ body }),
    service.handleWebhook({ body }),
  ]);

  const outcomes = results.map((r) => r.result).sort();
  assert.deepEqual(outcomes, ["already_approved", "approved"]);
  assert.equal(
    db.purchases.get("cmpurchase000abc123")?.paymentStatus,
    "completed",
  );
  assert.deepEqual(notified, ["cmpurchase000abc123"]);
  assert.equal(
    db.events.filter((e) => e.type === "payment_approved").length,
    1,
  );
});

test("approval is refused when the paid amount or currency differs from the order", async () => {
  for (const payment of [
    approvedPayment({ paidAmountInCents: 100 }),
    approvedPayment({ paidCurrency: "USD" }),
    approvedPayment({ paidAmountInCents: null }),
  ]) {
    const db = createFakeDb([basePurchase()]);
    const { service, notified } = createService(db, {
      getPayment: async () => payment,
    });
    const { result } = await service.handleWebhook({
      body: { type: "payment", data: { id: "pay-1" } },
    });
    assert.equal(result, "amount_mismatch");
    assert.equal(
      db.purchases.get("cmpurchase000abc123")?.paymentStatus,
      "pending",
    );
    assert.equal(notified.length, 0);
  }
});

test("a rejected attempt followed by an approved payment on the same order is approved", async () => {
  const db = createFakeDb([basePurchase()]);
  const { service } = createService(db);
  await service.applyPayment(
    "cmpurchase000abc123",
    approvedPayment({ status: "failed", rawStatus: "rejected" }),
    "webhook",
  );
  assert.equal(
    db.purchases.get("cmpurchase000abc123")?.paymentStatus,
    "failed",
  );

  const result = await service.applyPayment(
    "cmpurchase000abc123",
    approvedPayment(),
    "webhook",
  );
  assert.equal(result, "approved");
  assert.equal(
    db.purchases.get("cmpurchase000abc123")?.paymentStatus,
    "completed",
  );
});

test("refund after approval marks the purchase refunded and closes an open session", async () => {
  const db = createFakeDb([
    basePurchase({ paymentStatus: "completed", sessionStatus: "SCHEDULED" }),
  ]);
  const { service } = createService(db);
  const result = await service.applyPayment(
    "cmpurchase000abc123",
    approvedPayment({ status: "refunded", rawStatus: "refunded" }),
    "webhook",
  );
  assert.equal(result, "refunded");
  const row = db.purchases.get("cmpurchase000abc123");
  assert.equal(row?.paymentStatus, "refunded");
  assert.equal(row?.sessionStatus, "REFUNDED");
  assert.ok(row?.refundedAt instanceof Date);
});

test("refund of a session already held keeps the session status (only the payment changes)", async () => {
  const db = createFakeDb([
    basePurchase({ paymentStatus: "completed", sessionStatus: "COMPLETED" }),
  ]);
  const { service } = createService(db);
  await service.applyPayment(
    "cmpurchase000abc123",
    approvedPayment({ status: "refunded", rawStatus: "charged_back" }),
    "webhook",
  );
  const row = db.purchases.get("cmpurchase000abc123");
  assert.equal(row?.paymentStatus, "refunded");
  assert.equal(row?.sessionStatus, "COMPLETED");
});

test("payments from other flows (credits) are ignored by this webhook", async () => {
  const db = createFakeDb([basePurchase()]);
  const { service, notified } = createService(db, {
    getPayment: async () =>
      approvedPayment({ externalReference: "cmplanpurchase123" }),
  });
  const { result } = await service.handleWebhook({
    body: { type: "payment", data: { id: "pay-9" } },
  });
  assert.equal(result, "ignored");
  assert.equal(
    db.purchases.get("cmpurchase000abc123")?.paymentStatus,
    "pending",
  );
  assert.equal(notified.length, 0);
});

test("with a webhook secret configured, an unsigned or forged notification is rejected", async () => {
  process.env.MERCADOPAGO_WEBHOOK_SECRET = "s3cret";
  const db = createFakeDb([basePurchase()]);
  const { service } = createService(db);
  const body = { type: "payment", data: { id: "pay-1" } };

  await assert.rejects(service.handleWebhook({ body }), UnauthorizedException);
  await assert.rejects(
    service.handleWebhook({
      body,
      xSignature: "ts=1,v1=deadbeef",
      xRequestId: "r1",
    }),
    UnauthorizedException,
  );

  const v1 = createHmac("sha256", "s3cret")
    .update("id:pay-1;request-id:r1;ts:1;")
    .digest("hex");
  const { result } = await service.handleWebhook({
    body,
    xSignature: `ts=1,v1=${v1}`,
    xRequestId: "r1",
  });
  assert.equal(result, "approved");
});

test("checkSignature reports each failure mode", () => {
  const body = { data: { id: "1" } };
  assert.equal(
    checkMercadoPagoSignature({ secrets: [], body }),
    "no_secret_configured",
  );
  assert.equal(checkMercadoPagoSignature({ secrets: ["x"], body }), "missing");
  assert.equal(
    checkMercadoPagoSignature({ secrets: ["x"], body, xSignature: "foo" }),
    "bad_format",
  );
  assert.equal(
    checkMercadoPagoSignature({
      secrets: ["x"],
      body,
      xSignature: "ts=1,v1=ab",
    }),
    "mismatch",
  );
});

test("the WhatsApp link only exists for a paid (and not refunded) purchase", () => {
  const purchase = {
    id: "cmpurchase000abc123",
    amountInCents: 7990,
    currency: "BRL",
    sessionStatus: "AWAITING_SCHEDULING" as const,
    scheduledAt: null,
    meetingUrl: "https://meet.google.com/abc",
    createdAt: new Date(),
    paidAt: null,
  };
  const number = "5511999990000";

  for (const status of [
    "none",
    "pending",
    "pending_payment",
    "failed",
    "refunded",
  ] as const) {
    const view = buildPurchaseView(
      { ...purchase, paymentStatus: status },
      "Maria",
      number,
    );
    assert.equal(view.whatsappUrl, null, status);
    assert.equal(view.meetingUrl, null, status);
  }

  const paid = buildPurchaseView(
    { ...purchase, paymentStatus: "completed" },
    "Maria Souza",
    number,
  );
  assert.ok(paid.whatsappUrl?.startsWith("https://wa.me/5511999990000?text="));
  assert.ok(
    decodeURIComponent(paid.whatsappUrl ?? "").includes(
      `#${purchaseCode(purchase.id)}`,
    ),
  );
  assert.equal(paid.meetingUrl, "https://meet.google.com/abc");

  const unconfigured = buildPurchaseView(
    { ...purchase, paymentStatus: "completed" },
    "Maria",
    null,
  );
  assert.equal(unconfigured.whatsappUrl, null);
  assert.equal(unconfigured.whatsappConfigured, false);
});

test("checkout requires accepting the policy and returns the Mercado Pago URL", async () => {
  const db = createFakeDb([]);
  db.mockInterviewPurchase.findFirst = async () => null;
  const { service } = createService(db);

  await assert.rejects(
    service.createCheckout("user-1", { acceptPolicy: false }),
    BadRequestException,
  );

  const result = await service.createCheckout("user-1", { acceptPolicy: true });
  assert.equal(
    result.checkoutPath,
    `/simulacao-de-entrevista/pagamento/${result.purchaseId}`,
  );
  const created = db.purchases.get(result.purchaseId);
  assert.equal(created?.amountInCents, 7990);
  assert.equal(created?.currency, "BRL");
  assert.equal(created?.paymentStatus, "pending");
  assert.ok(created?.policyAcceptedAt instanceof Date);
});

test("order page with refresh reconciles a pending order straight from Mercado Pago", async () => {
  const db = createFakeDb([basePurchase()]);
  const { service, notified } = createService(db, {
    findLatestByExternalReference: async () => approvedPayment(),
  });
  const view = await service.getMine("user-1", "cmpurchase000abc123", {
    refresh: true,
  });
  assert.equal(view.paymentStatus, "paid");
  assert.ok(view.whatsappUrl);
  assert.deepEqual(notified, ["cmpurchase000abc123"]);
});

test("helpers: external reference round trip, MP status normalization and WhatsApp message", () => {
  assert.equal(
    purchaseIdFromExternalReference(toExternalReference("abc")),
    "abc",
  );
  assert.equal(purchaseIdFromExternalReference("abc"), null);
  assert.equal(purchaseIdFromExternalReference(null), null);

  assert.equal(
    normalizeMpPayment({ id: 1, status: "charged_back" })?.status,
    "refunded",
  );
  assert.equal(
    normalizeMpPayment({ id: 1, status: "cancelled" })?.status,
    "failed",
  );
  assert.equal(
    normalizeMpPayment({ id: 1, status: "in_process" })?.status,
    "pending",
  );
  assert.equal(
    normalizeMpPayment({
      id: "1",
      status: "approved",
      transaction_amount: 79.9,
    })?.paidAmountInCents,
    7990,
  );
  assert.equal(normalizeMpPayment({ status: "approved" }), null);

  const url = buildWhatsappUrl({
    number: "5511999990000",
    purchaseId: "cmx123abc",
    buyerName: "Maria Souza",
  });
  const text = decodeURIComponent(url.split("text=")[1] ?? "");
  assert.ok(text.includes("Aqui é Maria."));
  assert.ok(text.includes("Pedido #123ABC"));
});

test("price comes from PRICE_INTERVIEW_SIM; missing or invalid price closes the sale", async () => {
  const db = createFakeDb([]);
  db.mockInterviewPurchase.findFirst = async () => null;
  const { service } = createService(db);

  process.env.PRICE_INTERVIEW_SIM = "12345";
  assert.equal(service.getOffer().amountInCents, 12345);
  const { purchaseId } = await service.createCheckout("user-1", {
    acceptPolicy: true,
  });
  assert.equal(db.purchases.get(purchaseId)?.amountInCents, 12345);

  for (const value of [
    undefined,
    "",
    "79,90",
    "79.90",
    "0",
    "-10",
    "abc",
    "99999999",
  ]) {
    if (value === undefined) delete process.env.PRICE_INTERVIEW_SIM;
    else process.env.PRICE_INTERVIEW_SIM = value;
    assert.equal(service.getOffer().amountInCents, null, String(value));
    await assert.rejects(
      service.createCheckout("user-1", { acceptPolicy: true }),
      ServiceUnavailableException,
      String(value),
    );
  }
});

const pixPayload = {
  payment_method_id: "pix",
  payer: { email: "maria@example.com" },
};
const cardPayload = {
  payment_method_id: "visa",
  token: "card-token",
  installments: 1,
  payer: { email: "maria@example.com" },
};

test("brick: card approved on submit completes the order with the amount from the ORDER", async () => {
  const db = createFakeDb([basePurchase()]);
  const calls: {
    amountInCents: number;
    notificationUrl: string;
    idempotencyKey: string;
  }[] = [];
  const { service, notified } = createService(db, {
    createBrickPayment: async (input) => {
      calls.push(input);
      return {
        payment: approvedPayment(),
        qrCodeBase64: null,
        qrCodeText: null,
      };
    },
  });

  const result = await service.payWithBrick(
    "user-1",
    "cmpurchase000abc123",
    cardPayload,
  );
  assert.equal(result.status, "approved");
  assert.equal(
    result.redirectTo,
    "/simulacao-de-entrevista/pedido/cmpurchase000abc123",
  );
  assert.equal(calls[0]?.amountInCents, 7990);
  assert.equal(
    calls[0]?.notificationUrl,
    "https://api.earlycv.test/api/mock-interviews/webhook/mercadopago",
  );
  assert.match(
    calls[0]?.idempotencyKey ?? "",
    /^mock-interview-brick:cmpurchase000abc123:/,
  );
  assert.equal(
    db.purchases.get("cmpurchase000abc123")?.paymentStatus,
    "completed",
  );
  assert.deepEqual(notified, ["cmpurchase000abc123"]);
});

test("brick: Pix returns the QR code and leaves the order waiting for the webhook", async () => {
  const db = createFakeDb([basePurchase()]);
  const { service, notified } = createService(db, {
    createBrickPayment: async () => ({
      payment: approvedPayment({
        status: "pending",
        rawStatus: "pending",
        paymentId: "pix-1",
      }),
      qrCodeBase64: "BASE64",
      qrCodeText: "00020126...",
    }),
  });
  const result = await service.payWithBrick(
    "user-1",
    "cmpurchase000abc123",
    pixPayload,
  );
  assert.equal(result.status, "pending");
  assert.equal(result.qrCodeText, "00020126...");
  const row = db.purchases.get("cmpurchase000abc123");
  assert.equal(row?.paymentStatus, "pending_payment");
  assert.equal(row?.mpPaymentId, "pix-1");
  assert.equal(notified.length, 0);

  // Com Pix em aberto, uma segunda tentativa é barrada (nunca dois pagamentos).
  await assert.rejects(
    service.payWithBrick("user-1", "cmpurchase000abc123", cardPayload),
    ConflictException,
  );
  // E a recusa atrasada de uma tentativa anterior não derruba o Pix atual.
  const stale = await service.applyPayment(
    "cmpurchase000abc123",
    approvedPayment({
      status: "failed",
      rawStatus: "rejected",
      paymentId: "old-card",
    }),
    "webhook",
  );
  assert.equal(stale, "ignored");
  assert.equal(
    db.purchases.get("cmpurchase000abc123")?.paymentStatus,
    "pending_payment",
  );
});

test("brick: rejected card frees the order for another attempt", async () => {
  const db = createFakeDb([basePurchase()]);
  let attempt = 0;
  const { service } = createService(db, {
    createBrickPayment: async () => {
      attempt += 1;
      return attempt === 1
        ? {
            payment: approvedPayment({
              status: "failed",
              rawStatus: "rejected",
              statusDetail: "cc_rejected_high_risk",
              paymentId: "card-1",
            }),
            qrCodeBase64: null,
            qrCodeText: null,
          }
        : {
            payment: approvedPayment({ paymentId: "card-2" }),
            qrCodeBase64: null,
            qrCodeText: null,
          };
    },
  });

  await assert.rejects(
    service.payWithBrick("user-1", "cmpurchase000abc123", cardPayload),
    (error: unknown) =>
      error instanceof BadRequestException &&
      JSON.stringify(error.getResponse()).includes("análise de risco"),
  );
  assert.equal(
    db.purchases.get("cmpurchase000abc123")?.paymentStatus,
    "pending",
  );

  const second = await service.payWithBrick(
    "user-1",
    "cmpurchase000abc123",
    cardPayload,
  );
  assert.equal(second.status, "approved");
});

test("brick: two simultaneous submits create only one payment", async () => {
  const db = createFakeDb([basePurchase()]);
  let created = 0;
  const { service } = createService(db, {
    createBrickPayment: async () => {
      created += 1;
      return {
        payment: approvedPayment({
          status: "pending",
          rawStatus: "in_process",
        }),
        qrCodeBase64: null,
        qrCodeText: null,
      };
    },
  });
  const results = await Promise.allSettled([
    service.payWithBrick("user-1", "cmpurchase000abc123", cardPayload),
    service.payWithBrick("user-1", "cmpurchase000abc123", cardPayload),
  ]);
  assert.equal(created, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
});

test("brick: provider error leaves the order ambiguous (pending_payment) for reconciliation", async () => {
  const db = createFakeDb([basePurchase()]);
  const { service } = createService(db, {
    createBrickPayment: async () => {
      throw new Error("timeout");
    },
  });
  await assert.rejects(
    service.payWithBrick("user-1", "cmpurchase000abc123", cardPayload),
    BadRequestException,
  );
  assert.equal(
    db.purchases.get("cmpurchase000abc123")?.paymentStatus,
    "pending_payment",
  );
});

test("brick: invalid payload and paid orders are refused before touching Mercado Pago", async () => {
  const db = createFakeDb([basePurchase()]);
  let created = 0;
  const { service } = createService(db, {
    createBrickPayment: async () => {
      created += 1;
      return {
        payment: approvedPayment(),
        qrCodeBase64: null,
        qrCodeText: null,
      };
    },
  });
  await assert.rejects(
    service.payWithBrick("user-1", "cmpurchase000abc123", {
      payment_method_id: "visa",
    }),
    BadRequestException,
  );

  const paidDb = createFakeDb([basePurchase({ paymentStatus: "completed" })]);
  const paid = createService(paidDb, {
    createBrickPayment: async () => {
      created += 1;
      return {
        payment: approvedPayment(),
        qrCodeBase64: null,
        qrCodeText: null,
      };
    },
  });
  await assert.rejects(
    paid.service.getBrickCheckout("user-1", "cmpurchase000abc123"),
    ConflictException,
  );
  await assert.rejects(
    paid.service.payWithBrick("user-1", "cmpurchase000abc123", cardPayload),
    ConflictException,
  );
  assert.equal(created, 0);
});

test("brick: checkout data comes from the order", async () => {
  const db = createFakeDb([basePurchase()]);
  const { service } = createService(db);
  const data = await service.getBrickCheckout("user-1", "cmpurchase000abc123");
  assert.equal(data.amount, 79.9);
  assert.equal(data.currency, "BRL");
  assert.equal(data.payerEmail, "maria@example.com");
  assert.equal(data.code, "ABC123");
});

test("simulated payment: approves own order via applyPayment, without Mercado Pago", async () => {
  const db = createFakeDb([basePurchase()]);
  let mpCalls = 0;
  const { service, notified } = createService(db, {
    createBrickPayment: async () => {
      mpCalls += 1;
      throw new Error("should not be called");
    },
    getPayment: async () => {
      mpCalls += 1;
      return null;
    },
  });

  const result = await service.simulatePayment("user-1", "cmpurchase000abc123");

  assert.equal(result.result, "approved");
  assert.equal(
    result.redirectTo,
    "/simulacao-de-entrevista/pedido/cmpurchase000abc123",
  );
  const row = db.purchases.get("cmpurchase000abc123");
  assert.equal(row?.paymentStatus, "completed");
  assert.equal(row?.paymentMethod, "admin_simulated");
  assert.match(String(row?.mpPaymentId), /^simulated-/);
  assert.deepEqual(notified, ["cmpurchase000abc123"]);
  const event = db.events.find((e) => e.type === "payment_approved");
  assert.equal(event?.actor, "admin_simulated");
  assert.equal(mpCalls, 0);
});

test("simulated payment: refuses other users' orders and orders already paid", async () => {
  const db = createFakeDb([basePurchase()]);
  const { service } = createService(db);
  await assert.rejects(
    service.simulatePayment("user-2", "cmpurchase000abc123"),
    NotFoundException,
  );

  const paidDb = createFakeDb([basePurchase({ paymentStatus: "completed" })]);
  const paid = createService(paidDb);
  await assert.rejects(
    paid.service.simulatePayment("user-1", "cmpurchase000abc123"),
    ConflictException,
  );
});

test("simulated payment gate: needs flag, non-production and staff admin", () => {
  const admin = { isStaff: true, internalRole: "admin" } as const;
  const customer = { isStaff: false, internalRole: "none" } as const;
  const roleWithoutStaff = { isStaff: false, internalRole: "admin" } as const;

  process.env.NODE_ENV = "development";
  delete process.env.MOCK_INTERVIEW_SIMULATED_PAYMENT;
  assert.equal(canSimulateMockInterviewPayment(admin), false);

  process.env.MOCK_INTERVIEW_SIMULATED_PAYMENT = "true";
  assert.equal(canSimulateMockInterviewPayment(admin), true);
  assert.equal(canSimulateMockInterviewPayment(customer), false);
  assert.equal(canSimulateMockInterviewPayment(roleWithoutStaff), false);
  assert.equal(canSimulateMockInterviewPayment(null), false);

  process.env.NODE_ENV = "production";
  assert.equal(canSimulateMockInterviewPayment(admin), false);
});
