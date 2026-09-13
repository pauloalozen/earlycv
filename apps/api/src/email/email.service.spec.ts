import assert from "node:assert/strict";
import { test } from "node:test";

import { DefaultEmailService } from "./email.service";
import type { EmailRoutingPolicy, EmailSendResult } from "./email.types";

function buildPolicy(result: EmailSendResult): {
  policy: EmailRoutingPolicy;
  sentTo: unknown[];
} {
  const sentTo: unknown[] = [];
  const policy: EmailRoutingPolicy = {
    resolve: () => ({
      name: result.provider,
      async send(message) {
        sentTo.push(message);
        return result;
      },
    }),
  };
  return { policy, sentTo };
}

test("DefaultEmailService resolves the provider via the policy and returns its result unchanged", async () => {
  const { policy, sentTo } = buildPolicy({
    outcome: "SENT",
    provider: "RESEND",
    providerMessageId: "email_1",
  });
  const service = new DefaultEmailService(policy as never);

  const result = await service.send({
    category: "AUTHENTICATION",
    message: { to: "a@example.com", subject: "s", text: "t" },
  });

  assert.deepEqual(result, {
    outcome: "SENT",
    provider: "RESEND",
    providerMessageId: "email_1",
  });
  assert.equal(sentTo.length, 1);
});

test("DefaultEmailService never persists anything — it only resolves, delegates and returns", async () => {
  const { policy } = buildPolicy({
    outcome: "OUTCOME_UNKNOWN",
    provider: "SES",
    providerMessageId: null,
    errorMessage: "timeout",
  });
  const service = new DefaultEmailService(policy as never);

  const result = await service.send({
    category: "JOB_ALERT",
    message: { to: "a@example.com", subject: "s", text: "t" },
  });

  assert.equal(result.outcome, "OUTCOME_UNKNOWN");
  // DefaultEmailService não recebe DatabaseService (nem qualquer client de
  // persistência) no construtor — não tem como gravar nada mesmo que
  // quisesse (ver email.service.ts). Quem persiste é o chamador.
});
