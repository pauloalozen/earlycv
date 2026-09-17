import assert from "node:assert/strict";
import { test } from "node:test";

import { Logger } from "@nestjs/common";

import { DefaultEmailService } from "./email.service";
import type {
  EmailMessage,
  EmailRoutingPolicy,
  EmailSendResult,
  ResolvedEmailRoute,
} from "./email.types";

function buildPolicy(
  route: Partial<ResolvedEmailRoute> & { result: EmailSendResult },
): {
  policy: EmailRoutingPolicy;
  sentMessages: EmailMessage[];
} {
  const sentMessages: EmailMessage[] = [];
  const policy: EmailRoutingPolicy = {
    resolve: () => ({
      provider: {
        name: route.result.provider,
        async send(message) {
          sentMessages.push(message);
          return route.result;
        },
      },
      senderProfile: route.senderProfile,
      tags: route.tags,
    }),
  };
  return { policy, sentMessages };
}

test("DefaultEmailService resolves the route via the policy and returns the provider's result unchanged", async () => {
  const { policy, sentMessages } = buildPolicy({
    result: {
      outcome: "SENT",
      provider: "RESEND",
      providerMessageId: "email_1",
    },
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
  assert.equal(sentMessages.length, 1);
});

test("DefaultEmailService never persists anything — it only resolves, delegates and returns", async () => {
  const { policy } = buildPolicy({
    result: {
      outcome: "OUTCOME_UNKNOWN",
      provider: "SES",
      providerMessageId: null,
      errorMessage: "timeout",
    },
    senderProfile: {
      fromEmail: "vagas@alertas.earlycv.com.br",
      fromName: "EarlyCV",
      configurationSet: "earlycv-bulk-email",
    },
    tags: { category: "JOB_ALERT" },
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

test("DefaultEmailService merges senderProfile + tags from the resolved route into the message — never decides this itself, never knows what SES is", async () => {
  const { policy, sentMessages } = buildPolicy({
    result: { outcome: "SENT", provider: "SES", providerMessageId: "ses-1" },
    senderProfile: {
      fromEmail: "vagas@alertas.earlycv.com.br",
      fromName: "EarlyCV — Alerta de Vagas",
      replyTo: "contato@earlycv.com.br",
      configurationSet: "earlycv-bulk-email",
    },
    tags: { category: "JOB_ALERT" },
  });
  const service = new DefaultEmailService(policy as never);

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
  // Tags do chamador (correlationType/correlationId) preservadas, tag da
  // rota (category) acrescentada — nunca uma substitui a outra.
  assert.deepEqual(sent.tags, {
    correlationType: "MONITOR_DIGEST",
    correlationId: "digest-1",
    category: "JOB_ALERT",
  });
});

test("DefaultEmailService never touches from/replyTo/configurationSet/tags when the route has no senderProfile (e.g. Resend)", async () => {
  const { policy, sentMessages } = buildPolicy({
    result: {
      outcome: "SENT",
      provider: "RESEND",
      providerMessageId: "resend-1",
    },
  });
  const service = new DefaultEmailService(policy as never);

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

// Sem correlationType no log, "category: PRODUCT_ANNOUNCEMENT, outcome:
// SENT" é indistinguível entre uma campanha real e um envio de TESTE (ver
// product-update-email.service.ts sendTest, correlationType=
// PRODUCT_UPDATE_TEST) — foi exatamente essa ambiguidade que causou um
// falso alarme de "webhook não correlacionou" em produção quando o envio
// era, na verdade, um teste sem delivery persistida (esperado).
test("email_send log includes correlationType/correlationId so a test send is never confused with a real campaign send in the logs", async (t) => {
  const { policy } = buildPolicy({
    result: {
      outcome: "SENT",
      provider: "SES",
      providerMessageId: "ses-msg-1",
    },
    tags: { category: "PRODUCT_ANNOUNCEMENT" },
  });
  const service = new DefaultEmailService(policy as never);

  const logs: unknown[][] = [];
  t.mock.method(Logger.prototype, "log", (...args: unknown[]) => {
    logs.push(args);
  });

  await service.send({
    category: "PRODUCT_ANNOUNCEMENT",
    message: {
      to: "a@example.com",
      subject: "s",
      text: "t",
      tags: {
        correlationType: "PRODUCT_UPDATE_TEST",
        correlationId: "product-update-1",
      },
    },
  });

  const [, payload] = logs[0] as [string, Record<string, unknown>];
  assert.equal(payload.correlationType, "PRODUCT_UPDATE_TEST");
  assert.equal(payload.correlationId, "product-update-1");
});
