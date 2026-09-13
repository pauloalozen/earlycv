import assert from "node:assert/strict";
import { test } from "node:test";

import { DefaultEmailService } from "./email.service";
import type {
  EmailCategory,
  EmailMessage,
  EmailRoutingPolicy,
  EmailSendResult,
} from "./email.types";

function buildPolicy(result: EmailSendResult): {
  policy: EmailRoutingPolicy;
  sentMessages: EmailMessage[];
} {
  const sentMessages: EmailMessage[] = [];
  const policy: EmailRoutingPolicy = {
    resolve: () => ({
      name: result.provider,
      async send(message) {
        sentMessages.push(message);
        return result;
      },
    }),
  };
  return { policy, sentMessages };
}

const NO_SES_PROFILE_CONFIG = {
  getSesSenderProfile(): never {
    throw new Error("não deveria ser chamado — provider resolvido é RESEND");
  },
};

test("DefaultEmailService resolves the provider via the policy and returns its result unchanged", async () => {
  const { policy, sentMessages } = buildPolicy({
    outcome: "SENT",
    provider: "RESEND",
    providerMessageId: "email_1",
  });
  const service = new DefaultEmailService(
    policy as never,
    NO_SES_PROFILE_CONFIG,
  );

  const result = await service.send({
    category: "AUTHENTICATION",
    message: { to: "a@example.com", subject: "s", text: "t" },
  });

  assert.deepEqual(result, {
    outcome: "SENT",
    provider: "RESEND",
    providerMessageId: "email_1",
  });
  assert.equal(sentMessages.length, 1);
});

test("DefaultEmailService never persists anything — it only resolves, delegates and returns", async () => {
  const { policy } = buildPolicy({
    outcome: "OUTCOME_UNKNOWN",
    provider: "SES",
    providerMessageId: null,
    errorMessage: "timeout",
  });
  const config = {
    getSesSenderProfile: () => ({
      fromEmail: "vagas@alertas.earlycv.com.br",
      fromName: "EarlyCV",
      configurationSetName: "earlycv-bulk-email",
    }),
  };
  const service = new DefaultEmailService(policy as never, config);

  const result = await service.send({
    category: "JOB_ALERT",
    message: { to: "a@example.com", subject: "s", text: "t" },
  });

  assert.equal(result.outcome, "OUTCOME_UNKNOWN");
  // DefaultEmailService não recebe DatabaseService (nem qualquer client de
  // persistência) no construtor — não tem como gravar nada mesmo que
  // quisesse (ver email.service.ts). Quem persiste é o chamador.
});

test("DefaultEmailService injects from/replyTo/configurationSet + tag category when the resolved provider is SES", async () => {
  const { policy, sentMessages } = buildPolicy({
    outcome: "SENT",
    provider: "SES",
    providerMessageId: "ses-1",
  });
  const config = {
    getSesSenderProfile: (category: EmailCategory) => {
      assert.equal(category, "JOB_ALERT");
      return {
        fromEmail: "vagas@alertas.earlycv.com.br",
        fromName: "EarlyCV — Alerta de Vagas",
        replyTo: "contato@earlycv.com.br",
        configurationSetName: "earlycv-bulk-email",
      };
    },
  };
  const service = new DefaultEmailService(policy as never, config);

  await service.send({
    category: "JOB_ALERT",
    message: {
      to: "a@example.com",
      subject: "s",
      text: "t",
      tags: { correlationType: "MONITOR_DIGEST", correlationId: "digest-1" },
    },
  });

  assert.equal(sentMessages.length, 1);
  const [sent] = sentMessages;
  assert.deepEqual(sent.from, {
    email: "vagas@alertas.earlycv.com.br",
    name: "EarlyCV — Alerta de Vagas",
  });
  assert.equal(sent.replyTo, "contato@earlycv.com.br");
  assert.equal(sent.configurationSet, "earlycv-bulk-email");
  assert.deepEqual(sent.tags, {
    correlationType: "MONITOR_DIGEST",
    correlationId: "digest-1",
    category: "JOB_ALERT",
  });
});

test("DefaultEmailService never touches from/replyTo/configurationSet/tags when the resolved provider is Resend", async () => {
  const { policy, sentMessages } = buildPolicy({
    outcome: "SENT",
    provider: "RESEND",
    providerMessageId: "resend-1",
  });
  const service = new DefaultEmailService(
    policy as never,
    NO_SES_PROFILE_CONFIG,
  );

  await service.send({
    category: "AUTHENTICATION",
    message: { to: "a@example.com", subject: "s", text: "t" },
  });

  const [sent] = sentMessages;
  assert.equal(sent.from, undefined);
  assert.equal(sent.replyTo, undefined);
  assert.equal(sent.configurationSet, undefined);
  assert.equal(sent.tags, undefined);
});
