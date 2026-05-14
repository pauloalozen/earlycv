import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BrickPayloadValidationError,
  parseBrickPaymentPayload,
} from "./brick-payload";

test("accepts pix payload with payer email", () => {
  const parsed = parseBrickPaymentPayload({
    payment_method_id: "pix",
    payer: { email: "user@example.com" },
  });

  assert.deepEqual(parsed, {
    kind: "pix",
    paymentMethodId: "pix",
    payerEmail: "user@example.com",
    payerIdentification: undefined,
  });
});

test("accepts card payload with token and installments", () => {
  const parsed = parseBrickPaymentPayload({
    payment_method_id: "master",
    token: "tok_123",
    installments: 2,
    payer: { email: "card@example.com" },
  });

  assert.equal(parsed.kind, "card");
  assert.equal(parsed.paymentMethodId, "master");
  assert.equal(parsed.token, "tok_123");
  assert.equal(parsed.installments, 2);
});

test("rejects boleto payment method", () => {
  assert.throws(
    () => parseBrickPaymentPayload({ payment_method_id: "bolbradesco" }),
    (err: unknown) =>
      err instanceof BrickPayloadValidationError &&
      err.code === "brick_payment_method_not_supported",
  );
});

test("rejects non-pix method without token", () => {
  assert.throws(
    () =>
      parseBrickPaymentPayload({
        payment_method_id: "visa",
        installments: 1,
      }),
    (err: unknown) =>
      err instanceof BrickPayloadValidationError &&
      err.code === "brick_payment_method_not_supported",
  );
});

test("rejects pix without payer email", () => {
  assert.throws(
    () => parseBrickPaymentPayload({ payment_method_id: "pix" }),
    (err: unknown) =>
      err instanceof BrickPayloadValidationError &&
      err.code === "brick_payload_invalid",
  );
});
