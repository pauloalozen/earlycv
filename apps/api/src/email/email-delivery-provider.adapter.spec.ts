import assert from "node:assert/strict";
import { test } from "node:test";

import type { EmailDeliveryPort } from "./email-delivery.port";
import { EmailDeliveryProviderAdapter } from "./email-delivery-provider.adapter";

function buildPort(impl: EmailDeliveryPort["send"]): EmailDeliveryPort {
  return { send: impl };
}

test("EmailDeliveryProviderAdapter maps a successful send to outcome SENT", async () => {
  const adapter = new EmailDeliveryProviderAdapter(
    buildPort(async () => ({ providerMessageId: "email_123" })),
  );

  const result = await adapter.send({
    to: "a@example.com",
    subject: "s",
    text: "t",
  });

  assert.deepEqual(result, {
    outcome: "SENT",
    provider: "RESEND",
    providerMessageId: "email_123",
  });
});

test("EmailDeliveryProviderAdapter maps a confirmed Resend rejection (HTTP error) to FAILED", async () => {
  const adapter = new EmailDeliveryProviderAdapter(
    buildPort(async () => {
      throw new Error("Failed to send email via Resend: 422");
    }),
  );

  const result = await adapter.send({
    to: "a@example.com",
    subject: "s",
    text: "t",
  });

  assert.equal(result.outcome, "FAILED");
  assert.equal(result.provider, "RESEND");
  assert.equal(result.providerMessageId, null);
});

test("EmailDeliveryProviderAdapter maps any other thrown error (network/timeout, ambiguous) to OUTCOME_UNKNOWN — never FAILED", async () => {
  const adapter = new EmailDeliveryProviderAdapter(
    buildPort(async () => {
      throw new TypeError("fetch failed");
    }),
  );

  const result = await adapter.send({
    to: "a@example.com",
    subject: "s",
    text: "t",
  });

  assert.equal(result.outcome, "OUTCOME_UNKNOWN");
  assert.equal(result.provider, "RESEND");
  assert.equal(result.providerMessageId, null);
});
