import assert from "node:assert/strict";
import { test } from "node:test";
import type { EmailProvider } from "./email.types";
import type { EmailConfigService } from "./email-config.service";
import { DefaultEmailRoutingPolicy } from "./email-routing.policy";

function fakeProvider(name: "RESEND" | "SES"): EmailProvider {
  return {
    name,
    async send() {
      return { outcome: "SENT", provider: name, providerMessageId: "x" };
    },
  };
}

function buildConfig(
  sesEnabled: boolean,
): Pick<EmailConfigService, "isSesEnabled"> {
  return { isSesEnabled: () => sesEnabled };
}

test("DefaultEmailRoutingPolicy routes AUTHENTICATION and BILLING to Resend regardless of SES state", () => {
  const resend = fakeProvider("RESEND");
  const ses = fakeProvider("SES");

  for (const sesEnabled of [true, false]) {
    const policy = new DefaultEmailRoutingPolicy(
      resend,
      ses,
      buildConfig(sesEnabled),
    );

    assert.equal(policy.resolve("AUTHENTICATION"), resend);
    assert.equal(policy.resolve("BILLING"), resend);
  }
});

test("DefaultEmailRoutingPolicy routes every bulk category (JOB_ALERT, PRODUCT_ANNOUNCEMENT, MARKETING, ADMIN_COMMUNICATION) to SES when enabled", () => {
  const resend = fakeProvider("RESEND");
  const ses = fakeProvider("SES");
  const policy = new DefaultEmailRoutingPolicy(resend, ses, buildConfig(true));

  for (const category of [
    "JOB_ALERT",
    "PRODUCT_ANNOUNCEMENT",
    "MARKETING",
    "ADMIN_COMMUNICATION",
  ] as const) {
    assert.equal(policy.resolve(category), ses);
  }
});

test("DefaultEmailRoutingPolicy REFUSES every bulk category when SES is disabled — never silently falls back to Resend (no automatic fallback by product decision)", () => {
  const resend = fakeProvider("RESEND");
  const ses = fakeProvider("SES");
  const policy = new DefaultEmailRoutingPolicy(resend, ses, buildConfig(false));

  for (const category of [
    "JOB_ALERT",
    "PRODUCT_ANNOUNCEMENT",
    "MARKETING",
    "ADMIN_COMMUNICATION",
  ] as const) {
    assert.throws(() => policy.resolve(category), /SES_EMAIL_ENABLED/);
  }
});
