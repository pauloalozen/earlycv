import assert from "node:assert/strict";
import { test } from "node:test";
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
