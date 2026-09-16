import assert from "node:assert/strict";
import { test } from "node:test";
import type { EmailProvider, EmailSenderProfile } from "./email.types";
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

const JOB_ALERT_PROFILE: EmailSenderProfile = {
  fromEmail: "vagas@alertas.earlycv.com.br",
  fromName: "EarlyCV — Alerta de Vagas",
  replyTo: "contato@earlycv.com.br",
  configurationSet: "earlycv-bulk-email",
};

const PRODUCT_ANNOUNCEMENT_PROFILE: EmailSenderProfile = {
  fromEmail: "contato@earlycv.com.br",
  fromName: "EarlyCV",
  replyTo: "contato@earlycv.com.br",
  configurationSet: "earlycv-bulk-email",
};

function buildConfig(
  sesEnabled: boolean,
): Pick<EmailConfigService, "isSesEnabled" | "getSesSenderProfile"> {
  return {
    isSesEnabled: () => sesEnabled,
    getSesSenderProfile: (category) => {
      if (category === "JOB_ALERT") return JOB_ALERT_PROFILE;
      if (category === "PRODUCT_ANNOUNCEMENT")
        return PRODUCT_ANNOUNCEMENT_PROFILE;
      throw new Error(`sender profile não configurado para ${category}`);
    },
  };
}

test("DefaultEmailRoutingPolicy routes AUTHENTICATION and BILLING to Resend regardless of SES state, never a senderProfile", () => {
  const resend = fakeProvider("RESEND");
  const ses = fakeProvider("SES");

  for (const sesEnabled of [true, false]) {
    const policy = new DefaultEmailRoutingPolicy(
      resend,
      ses,
      buildConfig(sesEnabled),
    );

    for (const category of ["AUTHENTICATION", "BILLING"] as const) {
      const route = policy.resolve(category);
      assert.equal(route.provider, resend);
      assert.equal(route.senderProfile, undefined);
      assert.equal(route.tags, undefined);
    }
  }
});

test("DefaultEmailRoutingPolicy resolves JOB_ALERT to SES + its senderProfile + tags.category, when SES is enabled", () => {
  const resend = fakeProvider("RESEND");
  const ses = fakeProvider("SES");
  const policy = new DefaultEmailRoutingPolicy(resend, ses, buildConfig(true));

  const route = policy.resolve("JOB_ALERT");

  assert.equal(route.provider, ses);
  assert.deepEqual(route.senderProfile, JOB_ALERT_PROFILE);
  assert.deepEqual(route.tags, { category: "JOB_ALERT" });
});

test("DefaultEmailRoutingPolicy resolves PRODUCT_ANNOUNCEMENT to SES + its own senderProfile + tags.category, isolado do perfil JOB_ALERT", () => {
  const resend = fakeProvider("RESEND");
  const ses = fakeProvider("SES");
  const policy = new DefaultEmailRoutingPolicy(resend, ses, buildConfig(true));

  const route = policy.resolve("PRODUCT_ANNOUNCEMENT");

  assert.equal(route.provider, ses);
  assert.deepEqual(route.senderProfile, PRODUCT_ANNOUNCEMENT_PROFILE);
  assert.deepEqual(route.tags, { category: "PRODUCT_ANNOUNCEMENT" });
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

test("DefaultEmailRoutingPolicy REFUSES MARKETING/ADMIN_COMMUNICATION even with SES enabled — no senderProfile configured yet, so no category liberates sending by merely existing in the type", () => {
  const resend = fakeProvider("RESEND");
  const ses = fakeProvider("SES");
  const policy = new DefaultEmailRoutingPolicy(resend, ses, buildConfig(true));

  for (const category of ["MARKETING", "ADMIN_COMMUNICATION"] as const) {
    assert.throws(() => policy.resolve(category), /não configurado/);
  }
});
