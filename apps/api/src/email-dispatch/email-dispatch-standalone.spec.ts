import assert from "node:assert/strict";
import { test } from "node:test";

import { createConfig } from "./email-dispatch.test-support";
import { sendRelationshipTestWithoutDb } from "./email-dispatch-standalone";

// biome-ignore lint/suspicious/noExplicitAny: mensagem de teste
type Msg = Record<string, any>;

function setup(env: Parameters<typeof createConfig>[0] = {}) {
  const sent: Array<{ category: string; message: Msg }> = [];
  const emailService = {
    send: async (params: { category: string; message: Msg }) => {
      sent.push(params);
      return {
        outcome: "SENT" as const,
        provider: "SES" as const,
        providerMessageId: "ses-1",
      };
    },
  };
  return { sent, emailService, config: createConfig(env) };
}

const input = {
  kind: "WELCOME" as const,
  to: "paulo.alozen@gmail.com",
  name: "Paulo",
  appUrl: "https://earlycv.com.br",
};

test("no-db real test builds the SAME relationship message as the automatic flow: RELATIONSHIP, own topic, EMAIL_DISPATCH tags, text+html with unsubscribe placeholder", async () => {
  const { sent, emailService, config } = setup();

  const result = await sendRelationshipTestWithoutDb({
    ...input,
    config,
    emailService,
  });

  assert.equal(result.sent, true);
  assert.equal(sent.length, 1);
  const { category, message } = sent[0];
  assert.equal(category, "RELATIONSHIP");
  assert.equal(message.to, "paulo.alozen@gmail.com");
  assert.deepEqual(message.listManagementOptions, {
    contactListName: "earlycv-contacts",
    topicName: "relationship",
  });
  assert.equal(message.tags.correlationType, "EMAIL_DISPATCH");
  assert.match(message.tags.correlationId, /^manual-[0-9a-f-]{36}$/);
  assert.equal(message.tags.kind, "WELCOME");
  assert.ok(message.text.includes("{{amazonSESUnsubscribeUrl}}"));
  assert.ok(message.html.includes("{{amazonSESUnsubscribeUrl}}"));
});

test("no-db real test sends nothing when the infra is not ready (never falls back to the shared tracking config set)", async () => {
  const { sent, emailService, config } = setup({
    AWS_SES_RELATIONSHIP_CONFIGURATION_SET: "earlycv-bulk-email",
  });

  const result = await sendRelationshipTestWithoutDb({
    ...input,
    config,
    emailService,
  });

  assert.deepEqual(result, {
    sent: false,
    reason: "not_ready:relationship_config_set_is_shared_tracking_set",
  });
  assert.equal(sent.length, 0);
});

test("no-db feedback uses the template of the chosen feedback kind", async () => {
  const { sent, emailService, config } = setup();

  await sendRelationshipTestWithoutDb({
    ...input,
    kind: "FEEDBACK_FIRST_USE",
    config,
    emailService,
  });
  await sendRelationshipTestWithoutDb({
    ...input,
    kind: "FEEDBACK_SECOND_CALL",
    config,
    emailService,
  });

  assert.equal(sent[0].message.subject, "Sobre a análise do seu currículo");
  assert.equal(sent[1].message.subject, "Sua primeira experiência no EarlyCV");
});
