import assert from "node:assert/strict";
import { test } from "node:test";

import type { EmailConfigService } from "./email-config.service";
import { SesEmailProviderService } from "./ses-email-provider.service";

test("SesEmailProviderService.send rejects with a clear, isolated error when SES config is incomplete — never a generic AWS SDK failure", async () => {
  const config: Pick<EmailConfigService, "getSesConfig"> = {
    getSesConfig() {
      throw new Error(
        "SES_EMAIL_ENABLED=true mas configuração obrigatória ausente: accessKeyId, secretAccessKey",
      );
    },
  };
  const provider = new SesEmailProviderService(config);

  await assert.rejects(
    provider.send({ to: "a@example.com", subject: "s", text: "t" }),
    /configuração obrigatória ausente/,
  );
});
