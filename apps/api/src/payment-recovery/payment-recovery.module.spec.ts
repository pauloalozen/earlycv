import "reflect-metadata";

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { Test } from "@nestjs/testing";

import { PaymentRecoveryConfigService } from "./payment-recovery.config";
import { PAYMENT_RECOVERY_CONFIG } from "./payment-recovery.types";

const trackedEnvKeys = [
  "ADMIN_PAYMENT_RECOVERY_ENABLED",
  "PAYMENT_RECOVERY_EMAIL_ENABLED",
  "PAYMENT_RECOVERY_EMAIL_DRY_RUN",
  "PAYMENT_RECOVERY_EMAIL_ALLOWLIST",
  "PAYMENT_RECOVERY_TOKEN_TTL_DAYS",
  "PAYMENT_RECOVERY_PUBLIC_RATE_LIMIT_PER_MINUTE",
  "PAYMENT_RECOVERY_TOKEN_SINGLE_USE",
] as const;

const originalEnv = new Map<string, string | undefined>();

for (const key of trackedEnvKeys) {
  originalEnv.set(key, process.env[key]);
}

function resetTrackedEnv() {
  for (const key of trackedEnvKeys) {
    const value = originalEnv.get(key);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeEach(() => {
  resetTrackedEnv();
});

afterEach(() => {
  resetTrackedEnv();
});

async function buildConfigModule() {
  return Test.createTestingModule({
    providers: [
      PaymentRecoveryConfigService,
      {
        provide: PAYMENT_RECOVERY_CONFIG,
        useFactory: (config: PaymentRecoveryConfigService) => ({
          adminEnabled: config.isAdminEnabled(),
          emailAllowlist: config.emailAllowlist(),
          emailDryRun: config.isDryRun(),
          emailEnabled: config.isEmailEnabled(),
          publicRateLimitPerMinute: config.publicRateLimitPerMinute(),
          tokenSingleUse: config.isTokenSingleUse(),
          tokenTtlDays: config.tokenTtlDays(),
        }),
        inject: [PaymentRecoveryConfigService],
      },
    ],
  }).compile();
}

test("payment-recovery module resolves config provider", async () => {
  const moduleRef = await buildConfigModule();

  assert.ok(moduleRef.get(PaymentRecoveryConfigService));

  await moduleRef.close();
});

test("payment-recovery module exposes config token defaults", async () => {
  const moduleRef = await buildConfigModule();

  const config = moduleRef.get(PAYMENT_RECOVERY_CONFIG);

  assert.deepEqual(config, {
    adminEnabled: false,
    emailEnabled: false,
    emailDryRun: true,
    emailAllowlist: [],
    tokenTtlDays: 7,
    publicRateLimitPerMinute: 30,
    tokenSingleUse: true,
  });

  await moduleRef.close();
});

test("payment-recovery module exposes config token overrides", async () => {
  process.env.ADMIN_PAYMENT_RECOVERY_ENABLED = "true";
  process.env.PAYMENT_RECOVERY_EMAIL_ENABLED = "true";
  process.env.PAYMENT_RECOVERY_EMAIL_DRY_RUN = "false";
  process.env.PAYMENT_RECOVERY_EMAIL_ALLOWLIST =
    "ops@example.com, admin@example.com";
  process.env.PAYMENT_RECOVERY_TOKEN_TTL_DAYS = "9";
  process.env.PAYMENT_RECOVERY_PUBLIC_RATE_LIMIT_PER_MINUTE = "45";
  process.env.PAYMENT_RECOVERY_TOKEN_SINGLE_USE = "false";

  const moduleRef = await buildConfigModule();

  const config = moduleRef.get(PAYMENT_RECOVERY_CONFIG);

  assert.deepEqual(config, {
    adminEnabled: true,
    emailEnabled: true,
    emailDryRun: false,
    emailAllowlist: ["ops@example.com", "admin@example.com"],
    tokenTtlDays: 9,
    publicRateLimitPerMinute: 45,
    tokenSingleUse: false,
  });

  await moduleRef.close();
});

test("payment recovery config defaults to fail-closed values", () => {
  const service = new PaymentRecoveryConfigService();

  assert.equal(service.isAdminEnabled(), false);
  assert.equal(service.isEmailEnabled(), false);
  assert.equal(service.isDryRun(), true);
  assert.deepEqual(service.emailAllowlist(), []);
  assert.equal(service.tokenTtlDays(), 7);
  assert.equal(service.publicRateLimitPerMinute(), 30);
  assert.equal(service.isTokenSingleUse(), true);
});

test("payment recovery config uses fail-closed parsing for invalid values", () => {
  process.env.ADMIN_PAYMENT_RECOVERY_ENABLED = "definitely";
  process.env.PAYMENT_RECOVERY_EMAIL_ENABLED = "sometimes";
  process.env.PAYMENT_RECOVERY_EMAIL_DRY_RUN = "maybe";
  process.env.PAYMENT_RECOVERY_EMAIL_ALLOWLIST =
    " a@example.com, ,b@example.com ,,";
  process.env.PAYMENT_RECOVERY_TOKEN_TTL_DAYS = "NaN";
  process.env.PAYMENT_RECOVERY_PUBLIC_RATE_LIMIT_PER_MINUTE = "invalid";
  process.env.PAYMENT_RECOVERY_TOKEN_SINGLE_USE = "unexpected";

  const service = new PaymentRecoveryConfigService();

  assert.equal(service.isAdminEnabled(), false);
  assert.equal(service.isEmailEnabled(), false);
  assert.equal(service.isDryRun(), true);
  assert.deepEqual(service.emailAllowlist(), [
    "a@example.com",
    "b@example.com",
  ]);
  assert.equal(service.tokenTtlDays(), 7);
  assert.equal(service.publicRateLimitPerMinute(), 30);
  assert.equal(service.isTokenSingleUse(), true);
});

test("payment recovery config clamps numeric values into safe bounds", () => {
  process.env.PAYMENT_RECOVERY_TOKEN_TTL_DAYS = "0";
  process.env.PAYMENT_RECOVERY_PUBLIC_RATE_LIMIT_PER_MINUTE = "999";

  const service = new PaymentRecoveryConfigService();

  assert.equal(service.tokenTtlDays(), 1);
  assert.equal(service.publicRateLimitPerMinute(), 120);
});

test("payment recovery config treats malformed numeric strings as invalid", () => {
  process.env.PAYMENT_RECOVERY_TOKEN_TTL_DAYS = "8days";
  process.env.PAYMENT_RECOVERY_PUBLIC_RATE_LIMIT_PER_MINUTE = "31abc";

  const service = new PaymentRecoveryConfigService();

  assert.equal(service.tokenTtlDays(), 7);
  assert.equal(service.publicRateLimitPerMinute(), 30);
});
