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

test("DefaultEmailRoutingPolicy routes AUTHENTICATION, BILLING and ADMIN_COMMUNICATION to Resend regardless of SES state", () => {
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
    assert.equal(policy.resolve("ADMIN_COMMUNICATION"), resend);
  }
});

test("DefaultEmailRoutingPolicy routes JOB_ALERT to SES only when SES is enabled", () => {
  const resend = fakeProvider("RESEND");
  const ses = fakeProvider("SES");
  const policy = new DefaultEmailRoutingPolicy(resend, ses, buildConfig(true));

  assert.equal(policy.resolve("JOB_ALERT"), ses);
});

test("DefaultEmailRoutingPolicy REFUSES JOB_ALERT when SES is disabled — never silently falls back to Resend (no automatic fallback by product decision)", () => {
  const resend = fakeProvider("RESEND");
  const ses = fakeProvider("SES");
  const policy = new DefaultEmailRoutingPolicy(resend, ses, buildConfig(false));

  assert.throws(() => policy.resolve("JOB_ALERT"), /SES_EMAIL_ENABLED/);
});
