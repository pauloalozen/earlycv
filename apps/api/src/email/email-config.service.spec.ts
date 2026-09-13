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

test("EmailConfigService.getSesClientConfig throws listing every missing field, never partial config silently", () => {
  const service = new EmailConfigService(
    buildEnv({ SES_EMAIL_ENABLED: true, AWS_SES_REGION: "us-east-1" }),
  );

  assert.throws(
    () => service.getSesClientConfig(),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /accessKeyId/);
      assert.match(error.message, /secretAccessKey/);
      assert.doesNotMatch(error.message, /\bregion\b/);
      return true;
    },
  );
});

test("EmailConfigService.getSesClientConfig returns pure transport config — no identity of sender", () => {
  const service = new EmailConfigService(
    buildEnv({
      SES_EMAIL_ENABLED: true,
      AWS_SES_REGION: "us-east-1",
      AWS_SES_ACCESS_KEY_ID: "AKIA...",
      AWS_SES_SECRET_ACCESS_KEY: "secret",
    }),
  );

  assert.deepEqual(service.getSesClientConfig(), {
    region: "us-east-1",
    accessKeyId: "AKIA...",
    secretAccessKey: "secret",
  });
});

test("EmailConfigService.getSesSenderProfile throws for any category other than JOB_ALERT — nenhuma outra categoria libera envio", () => {
  const service = new EmailConfigService(
    buildEnv({
      SES_EMAIL_ENABLED: true,
      AWS_SES_JOB_ALERT_FROM_EMAIL: "vagas@alertas.earlycv.com.br",
      AWS_SES_JOB_ALERT_FROM_NAME: "EarlyCV — Alerta de Vagas",
      AWS_SES_CONFIGURATION_SET: "earlycv-bulk-email",
    }),
  );

  for (const category of [
    "AUTHENTICATION",
    "BILLING",
    "PRODUCT_ANNOUNCEMENT",
    "MARKETING",
    "ADMIN_COMMUNICATION",
  ] as const) {
    assert.throws(
      () => service.getSesSenderProfile(category),
      /não configurado/,
    );
  }
});

test("EmailConfigService.getSesSenderProfile(JOB_ALERT) throws listing every missing field", () => {
  const service = new EmailConfigService(
    buildEnv({
      SES_EMAIL_ENABLED: true,
      AWS_SES_JOB_ALERT_FROM_EMAIL: "x@y.com",
    }),
  );

  assert.throws(
    () => service.getSesSenderProfile("JOB_ALERT"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /fromName/);
      assert.match(error.message, /configurationSet/);
      assert.doesNotMatch(error.message, /fromEmail/);
      return true;
    },
  );
});

test("EmailConfigService.getSesSenderProfile(JOB_ALERT) returns the full profile, replyTo optional", () => {
  const service = new EmailConfigService(
    buildEnv({
      SES_EMAIL_ENABLED: true,
      AWS_SES_JOB_ALERT_FROM_EMAIL: "vagas@alertas.earlycv.com.br",
      AWS_SES_JOB_ALERT_FROM_NAME: "EarlyCV — Alerta de Vagas",
      AWS_SES_JOB_ALERT_REPLY_TO: "contato@earlycv.com.br",
      AWS_SES_CONFIGURATION_SET: "earlycv-bulk-email",
    }),
  );

  assert.deepEqual(service.getSesSenderProfile("JOB_ALERT"), {
    fromEmail: "vagas@alertas.earlycv.com.br",
    fromName: "EarlyCV — Alerta de Vagas",
    configurationSet: "earlycv-bulk-email",
    replyTo: "contato@earlycv.com.br",
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
