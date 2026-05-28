import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Ga4MeasurementService } from "./ga4-measurement.service";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete process.env.GA4_ENABLED;
  delete process.env.GA4_MEASUREMENT_ID;
  delete process.env.GA4_API_SECRET;
  delete process.env.GA4_DEBUG_MODE;
});

test("does not send when GA4 is disabled", async () => {
  process.env.GA4_ENABLED = "false";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const service = new Ga4MeasurementService();
  await service.sendPurchaseEvent({
    purchaseId: "purchase-1",
    userId: "user-1",
    value: 29.9,
    currency: "BRL",
  });

  assert.equal(calls, 0);
});

test("sends purchase payload with fallback client_id transaction_id value currency and items", async () => {
  process.env.GA4_ENABLED = "true";
  process.env.GA4_MEASUREMENT_ID = "G-TEST123";
  process.env.GA4_API_SECRET = "secret";

  let requestUrl = "";
  let requestBody = "";
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const service = new Ga4MeasurementService();
  await service.sendPurchaseEvent({
    purchaseId: "purchase-2",
    userId: "user-2",
    value: 59.9,
    currency: "BRL",
    planId: "pro",
    planName: "Pro",
    credits: 3,
    originAction: "buy_credits",
    paymentId: "mp-2",
    paymentReference: "pay-ref-2",
  });

  assert.match(requestUrl, /measurement_id=G-TEST123/);
  assert.match(requestUrl, /api_secret=secret/);

  const parsed = JSON.parse(requestBody) as {
    client_id?: string;
    events: Array<{ name: string; params: Record<string, unknown> }>;
  };
  assert.match(parsed.client_id ?? "", /^\d+\.\d+$/);
  assert.equal(parsed.events[0]?.name, "purchase");
  assert.equal(parsed.events[0]?.params.transaction_id, "purchase-2");
  assert.equal(parsed.events[0]?.params.value, 59.9);
  assert.equal(parsed.events[0]?.params.currency, "BRL");
  assert.equal(Array.isArray(parsed.events[0]?.params.items), true);
});

test("includes client_id when provided", async () => {
  process.env.GA4_ENABLED = "true";
  process.env.GA4_MEASUREMENT_ID = "G-TEST123";
  process.env.GA4_API_SECRET = "secret";

  let requestBody = "";
  globalThis.fetch = (async (_input, init) => {
    requestBody = String(init?.body ?? "");
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const service = new Ga4MeasurementService();
  await service.sendPurchaseEvent({
    purchaseId: "purchase-3",
    userId: "user-3",
    clientId: "1234567890.1234567890",
    value: 11.9,
    currency: "BRL",
  });

  const parsed = JSON.parse(requestBody) as {
    client_id?: string;
  };
  assert.equal(parsed.client_id, "1234567890.1234567890");
});
