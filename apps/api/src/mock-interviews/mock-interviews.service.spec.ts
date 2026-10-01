import "reflect-metadata";

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import { BadRequestException, UnauthorizedException } from "@nestjs/common";

import {
  buildWhatsappUrl,
  purchaseCode,
  purchaseIdFromExternalReference,
  toExternalReference,
} from "./mock-interview.config";
import {
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
        return row ? { ...row, user: { name: "Maria Souza" } } : null;
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
    createPreference: () => Promise<{
      checkoutUrl: string;
      preferenceId: string | null;
    }>;
  }> = {},
) {
  const notified: string[] = [];
  const service = new MockInterviewsService(
    db as never,
    {
      getPayment: gateway.getPayment ?? (async () => approvedPayment()),
      findLatestByExternalReference:
        gateway.findLatestByExternalReference ?? (async () => null),
      createPreference:
        gateway.createPreference ??
        (async () => ({
          checkoutUrl: "https://mp.test/checkout",
          preferenceId: "pref-2",
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
  process.env.MOCK_INTERVIEW_WHATSAPP_NUMBER = "+55 (11) 99999-0000";
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
  assert.equal(result.checkoutUrl, "https://mp.test/checkout");
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
