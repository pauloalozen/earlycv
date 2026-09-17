import assert from "node:assert/strict";
import { test } from "node:test";

import { dispatchSesEvent } from "./ses-webhook-dispatch";

// Envelope fiel ao formato real que a AWS documenta pra eventos publicados
// via Configuration Set (Send/Delivery/Open/Click/Bounce/Complaint/Reject):
// mail.tags sempre chega como Record<string, string[]> — cada tag custom
// (correlationType/correlationId/campaignId) com um único valor, mas dentro
// de um array, igual às tags nativas da AWS (ses:configuration-set etc.).
function sesNotification(overrides: {
  eventType: string;
  messageId?: string;
  tags?: Record<string, string[]>;
}) {
  return {
    eventType: overrides.eventType,
    mail: {
      timestamp: "2026-09-16T12:00:00.000Z",
      messageId: overrides.messageId ?? "0100abc-real-provider-message-id",
      source: "produto@earlycv.com.br",
      sourceArn: "arn:aws:ses:us-east-1:123456789012:identity/earlycv.com.br",
      sendingAccountId: "123456789012",
      destination: ["user@example.com"],
      headersTruncated: false,
      tags: {
        "ses:configuration-set": ["product-updates"],
        "ses:source-ip": ["198.51.100.1"],
        ...overrides.tags,
      },
    },
    ...(overrides.eventType === "Delivery"
      ? { delivery: { timestamp: "2026-09-16T12:00:05.000Z" } }
      : {}),
  };
}

function createDeps() {
  const productUpdateCalls: Array<{ messageId: string; payload: unknown }> = [];
  const monitorCalls: Array<{ messageId: string; payload: unknown }> = [];
  const logs: string[] = [];

  const deps = {
    productUpdateWebhookService: {
      processSesEvent: async (messageId: string, payload: unknown) => {
        productUpdateCalls.push({ messageId, payload });
        return { processed: true };
      },
      processSubscriptionEvent: async () => ({ processed: true }),
      // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
    } as any,
    webhookService: {
      processSesEvent: async (messageId: string, payload: unknown) => {
        monitorCalls.push({ messageId, payload });
        return { processed: true };
      },
      // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
    } as any,
    logger: {
      log: (message: string) => {
        logs.push(message);
      },
    },
  };

  return { deps, productUpdateCalls, monitorCalls, logs };
}

test("correlationType=MONITOR_DIGEST continua encaminhado ao MonitorDigestWebhookService, nunca ao Product Updates", async () => {
  const { deps, productUpdateCalls, monitorCalls } = createDeps();

  const result = await dispatchSesEvent(
    "sns-msg-1",
    sesNotification({
      eventType: "Delivery",
      tags: {
        correlationType: ["MONITOR_DIGEST"],
        correlationId: ["digest-1"],
      },
    }),
    deps,
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(monitorCalls.length, 1);
  assert.equal(productUpdateCalls.length, 0);
});

test("correlationType=PRODUCT_UPDATE é encaminhado ao ProductUpdateWebhookService, nunca ao Monitor", async () => {
  const { deps, productUpdateCalls, monitorCalls } = createDeps();

  const result = await dispatchSesEvent(
    "sns-msg-2",
    sesNotification({
      eventType: "Delivery",
      messageId: "provider-msg-real-campaign",
      tags: {
        correlationType: ["PRODUCT_UPDATE"],
        correlationId: ["delivery-42"],
        campaignId: ["product-update-7"],
      },
    }),
    deps,
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(productUpdateCalls.length, 1);
  assert.equal(monitorCalls.length, 0);

  const forwarded = productUpdateCalls[0]?.payload as {
    mail?: { tags?: Record<string, string[]> };
  };
  // Garante que o array de valores da tag sobreviveu intacto até o handler
  // de domínio (não foi achatado/perdido no dispatcher).
  assert.deepEqual(forwarded.mail?.tags?.correlationId, ["delivery-42"]);
});

test("correlationType desconhecido (nem MONITOR_DIGEST nem PRODUCT_UPDATE) é ignorado com 2xx, sem chamar handler nenhum de domínio específico", async () => {
  const { deps, productUpdateCalls, monitorCalls } = createDeps();

  const result = await dispatchSesEvent(
    "sns-msg-3",
    sesNotification({
      eventType: "Delivery",
      tags: { correlationType: ["MARKETING"], correlationId: ["campaign-x"] },
    }),
    deps,
  );

  assert.deepEqual(result, { ok: true });
  // Cai no MonitorDigestWebhookService (que já ignora com segurança
  // qualquer correlationType != MONITOR_DIGEST) — nunca no Product Updates.
  assert.equal(monitorCalls.length, 1);
  assert.equal(productUpdateCalls.length, 0);
});

test("Send e Delivery são repassados com o mesmo eventType e correlationId — cada evento atualiza a delivery correta", async () => {
  const { deps, productUpdateCalls } = createDeps();

  await dispatchSesEvent(
    "sns-msg-send",
    sesNotification({
      eventType: "Send",
      tags: {
        correlationType: ["PRODUCT_UPDATE"],
        correlationId: ["delivery-9"],
      },
    }),
    deps,
  );
  await dispatchSesEvent(
    "sns-msg-delivery",
    sesNotification({
      eventType: "Delivery",
      tags: {
        correlationType: ["PRODUCT_UPDATE"],
        correlationId: ["delivery-9"],
      },
    }),
    deps,
  );

  assert.equal(productUpdateCalls.length, 2);
  const [sendCall, deliveryCall] = productUpdateCalls as Array<{
    payload: { eventType: string; mail: { tags: Record<string, string[]> } };
  }>;
  assert.equal(sendCall.payload.eventType, "Send");
  assert.equal(deliveryCall.payload.eventType, "Delivery");
  assert.deepEqual(sendCall.payload.mail.tags.correlationId, ["delivery-9"]);
  assert.deepEqual(deliveryCall.payload.mail.tags.correlationId, [
    "delivery-9",
  ]);
});

test("correlationType=PRODUCT_UPDATE_TEST (envio de teste, sem delivery persistida) é ignorado explicitamente — nunca chama Monitor nem Product Updates, e o log nunca menciona digest", async () => {
  const { deps, productUpdateCalls, monitorCalls, logs } = createDeps();

  const result = await dispatchSesEvent(
    "sns-msg-4",
    sesNotification({
      eventType: "Send",
      tags: {
        correlationType: ["PRODUCT_UPDATE_TEST"],
        correlationId: ["product-update-99"],
      },
    }),
    deps,
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(productUpdateCalls.length, 0);
  assert.equal(monitorCalls.length, 0);
  assert.ok(logs.length > 0, "esperava um log explicando o ignore");
  for (const message of logs) {
    assert.doesNotMatch(message, /digest/i);
  }
});

test("um correlationType desconhecido não processado gera log genérico 'SES webhook not processed', nunca mencionando digest", async () => {
  const logs: string[] = [];
  const deps = {
    productUpdateWebhookService: {
      processSesEvent: async () => ({ processed: true }),
      processSubscriptionEvent: async () => ({ processed: true }),
      // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
    } as any,
    webhookService: {
      processSesEvent: async () => ({
        processed: false,
        reason: "unsupported_correlation_type",
      }),
      // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
    } as any,
    logger: {
      log: (message: string) => logs.push(message),
    },
  };

  await dispatchSesEvent(
    "sns-msg-5",
    sesNotification({ eventType: "Send" }),
    deps,
  );

  assert.equal(logs.length, 1);
  assert.match(logs[0] ?? "", /^SES webhook not processed:/);
  assert.doesNotMatch(logs[0] ?? "", /digest/i);
});
