import assert from "node:assert/strict";
import { test } from "node:test";

import type { AppEnv } from "../config/env.module";
import { EmailConfigService } from "./email-config.service";

function buildEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    API_HOST: "0.0.0.0",
    API_PORT: 4000,
    JOBS_GHOST_MODE: false,
    JWT_ACCESS_SECRET: "secret",
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_SECRET: "secret",
    JWT_REFRESH_TTL: 2592000,
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_CALLBACK_URL: "https://example.com",
    SES_EMAIL_ENABLED: false,
    ...overrides,
  };
}

test("EmailConfigService.isSesEnabled reflects SES_EMAIL_ENABLED", () => {
  assert.equal(
    new EmailConfigService(
      buildEnv({ SES_EMAIL_ENABLED: true }),
    ).isSesEnabled(),
    true,
  );
  assert.equal(
    new EmailConfigService(
      buildEnv({ SES_EMAIL_ENABLED: false }),
    ).isSesEnabled(),
    false,
  );
});

test("EmailConfigService.getSesConfig throws listing every missing field, never partial config silently", () => {
  const service = new EmailConfigService(
    buildEnv({ SES_EMAIL_ENABLED: true, AWS_SES_REGION: "us-east-1" }),
  );

  assert.throws(
    () => service.getSesConfig(),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /accessKeyId/);
      assert.match(error.message, /secretAccessKey/);
      assert.match(error.message, /configurationSetName/);
      assert.match(error.message, /fromEmail/);
      assert.match(error.message, /fromName/);
      assert.doesNotMatch(error.message, /\bregion\b/);
      return true;
    },
  );
});

test("EmailConfigService.getSesConfig returns the full config when everything is present", () => {
  const service = new EmailConfigService(
    buildEnv({
      SES_EMAIL_ENABLED: true,
      AWS_SES_REGION: "us-east-1",
      AWS_SES_ACCESS_KEY_ID: "AKIA...",
      AWS_SES_SECRET_ACCESS_KEY: "secret",
      AWS_SES_CONFIGURATION_SET: "earlycv-job-alert",
      AWS_SES_FROM_EMAIL: "vagas@alertas.earlycv.com.br",
      AWS_SES_FROM_NAME: "EarlyCV — Alerta de Vagas",
    }),
  );

  assert.deepEqual(service.getSesConfig(), {
    region: "us-east-1",
    accessKeyId: "AKIA...",
    secretAccessKey: "secret",
    configurationSetName: "earlycv-job-alert",
    fromEmail: "vagas@alertas.earlycv.com.br",
    fromName: "EarlyCV — Alerta de Vagas",
  });
});

test("EmailConfigService never fails when SES is disabled, even with zero config — auth/billing must keep working", () => {
  const service = new EmailConfigService(
    buildEnv({ SES_EMAIL_ENABLED: false }),
  );
  assert.equal(service.isSesEnabled(), false);
  assert.equal(service.getCustomMailFromDomain(), undefined);
  assert.equal(service.getExpectedSnsTopicArn(), undefined);
});
