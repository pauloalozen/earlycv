import assert from "node:assert/strict";
import { test } from "node:test";

import {
  sanitizePaymentAuditPayload,
  summarizeSafeError,
} from "./payment-audit-sanitization";

test("sanitizePaymentAuditPayload keeps operational whitelist only", () => {
  const sanitized = sanitizePaymentAuditPayload(
    {
      id: "evt-1",
      type: "payment",
      action: "payment.updated",
      topic: "payment",
      data: { id: "mp-1", token: "secret" },
      paymentId: "mp-1",
      externalReference: "purchase-1",
      preferenceId: "pref-1",
      merchantOrderId: "ord-1",
      status: "rejected",
      statusDetail: "cc_rejected_high_risk",
      purchaseId: "purchase-1",
      internalCheckoutId: "purchase-1",
      payer: {
        email: "private@example.com",
        identification: { number: "123" },
      },
      headers: {
        authorization: "Bearer abc",
        cookie: "session=xyz",
      },
      response: {
        body: {
          access_token: "secret-token",
        },
      },
    },
    {
      correlationId: "corr-1",
      requestId: "req-1",
    },
  );

  assert.equal(Boolean(sanitized), true);
  assert.equal(sanitized?.id, "evt-1");
  assert.equal(sanitized?.type, "payment");
  assert.equal(sanitized?.action, "payment.updated");
  assert.deepEqual(sanitized?.data, { id: "mp-1" });
  assert.equal(sanitized?.requestId, "req-1");
  assert.equal(sanitized?.correlationId, "corr-1");
  assert.equal("payer" in (sanitized ?? {}), false);
  assert.equal("headers" in (sanitized ?? {}), false);
  assert.equal("response" in (sanitized ?? {}), false);
});

test("summarizeSafeError strips nested sensitive structures", () => {
  const message = summarizeSafeError({
    name: "ProviderError",
    message: "request failed",
    code: "MP-401",
    status: 401,
    headers: {
      authorization: "Bearer should-not-leak",
    },
    response: {
      data: { access_token: "secret-token" },
    },
  });

  assert.equal(message.includes("ProviderError:request failed"), true);
  assert.equal(message.includes("code=MP-401"), true);
  assert.equal(message.includes("status=401"), true);
  assert.equal(message.includes("authorization"), false);
  assert.equal(message.includes("access_token"), false);
  assert.equal(message.includes("secret-token"), false);
});
