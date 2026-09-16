import assert from "node:assert/strict";
import { test } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import type { EmailMessage } from "./email.types";
import type { EmailConfigService } from "./email-config.service";
import { SesEmailProviderService } from "./ses-email-provider.service";

const RESOLVED_MESSAGE: EmailMessage = {
  to: "a@example.com",
  subject: "s",
  text: "t",
  from: { email: "vagas@alertas.earlycv.com.br", name: "EarlyCV" },
  configurationSet: "earlycv-bulk-email",
};

test("SesEmailProviderService.send rejects with a clear, isolated error when SES client config is incomplete — never a generic AWS SDK failure", async () => {
  const config: Pick<EmailConfigService, "getSesClientConfig"> = {
    getSesClientConfig() {
      throw new Error(
        "SES_EMAIL_ENABLED=true mas configuração obrigatória ausente: accessKeyId, secretAccessKey",
      );
    },
  };
  const provider = new SesEmailProviderService(config);

  await assert.rejects(
    provider.send(RESOLVED_MESSAGE),
    /configuração obrigatória ausente/,
  );
});

test("SesEmailProviderService.send rejects a message without from/configurationSet already resolved — only the facade should ever call this provider", async () => {
  const config: Pick<EmailConfigService, "getSesClientConfig"> = {
    getSesClientConfig() {
      throw new Error("não deveria nem chegar aqui");
    },
  };
  const provider = new SesEmailProviderService(config);

  await assert.rejects(
    provider.send({ to: "a@example.com", subject: "s", text: "t" }),
    /só a fachada/,
  );
});

// Regressão de bug real observado em produção: SES v2 rejeita
// "Reply-To" quando enviado como header genérico em
// Content.Simple.Headers ("Header <Reply-To> is not supported",
// httpStatusCode=400) — existe um campo dedicado, ReplyToAddresses, no
// nível raiz do SendEmailCommand, e é ele que precisa ser usado.
// Intercepta SESv2Client.prototype.send (nunca bate na rede real) só
// pra inspecionar o `command.input` que o provider de fato monta.
test("SesEmailProviderService.send puts replyTo in ReplyToAddresses, never as a Reply-To header in Content.Simple.Headers", async (t) => {
  let capturedInput: Record<string, unknown> | undefined;
  t.mock.method(
    SESv2Client.prototype,
    "send",
    async (command: { input: Record<string, unknown> }) => {
      capturedInput = command.input;
      return { MessageId: "ses-message-id" };
    },
  );

  const config: Pick<EmailConfigService, "getSesClientConfig"> = {
    getSesClientConfig: () => ({
      region: "us-east-1",
      accessKeyId: "AKIA...",
      secretAccessKey: "secret",
    }),
  };
  const provider = new SesEmailProviderService(config);

  const result = await provider.send({
    ...RESOLVED_MESSAGE,
    replyTo: "contato@earlycv.com.br",
    headers: { "List-Unsubscribe": "<https://example.com/unsub>" },
  });

  assert.equal(result.outcome, "SENT");
  assert.ok(capturedInput);
  assert.deepEqual(capturedInput.ReplyToAddresses, ["contato@earlycv.com.br"]);

  const content = capturedInput.Content as {
    Simple?: { Headers?: { Name: string; Value: string }[] };
  };
  const headerNames = (content.Simple?.Headers ?? []).map((h) => h.Name);
  assert.ok(
    !headerNames.includes("Reply-To"),
    "Reply-To nunca deve ir em Content.Simple.Headers",
  );
  // Outros headers (ex.: List-Unsubscribe) continuam passando normalmente
  // — só Reply-To tem tratamento especial.
  assert.ok(headerNames.includes("List-Unsubscribe"));
});

// Usado só pelo envio real de Product Updates (nunca Monitor/JOB_ALERT,
// nunca envio de teste) — SES resolve o descadastro nativo a partir disto,
// sem token/endpoint nosso.
test("SesEmailProviderService.send forwards listManagementOptions to ListManagementOptions, only when present", async (t) => {
  let capturedInput: Record<string, unknown> | undefined;
  t.mock.method(
    SESv2Client.prototype,
    "send",
    async (command: { input: Record<string, unknown> }) => {
      capturedInput = command.input;
      return { MessageId: "ses-message-id" };
    },
  );

  const config: Pick<EmailConfigService, "getSesClientConfig"> = {
    getSesClientConfig: () => ({
      region: "us-east-1",
      accessKeyId: "AKIA...",
      secretAccessKey: "secret",
    }),
  };
  const provider = new SesEmailProviderService(config);

  await provider.send({
    ...RESOLVED_MESSAGE,
    listManagementOptions: {
      contactListName: "earlycv-users",
      topicName: "product-updates",
    },
  });

  assert.ok(capturedInput);
  assert.deepEqual(capturedInput.ListManagementOptions, {
    ContactListName: "earlycv-users",
    TopicName: "product-updates",
  });

  capturedInput = undefined;
  await provider.send(RESOLVED_MESSAGE);
  assert.ok(capturedInput);
  assert.equal(capturedInput.ListManagementOptions, undefined);
});
