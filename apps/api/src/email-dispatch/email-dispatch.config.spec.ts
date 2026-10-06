import assert from "node:assert/strict";
import { test } from "node:test";

import { createConfig } from "./email-dispatch.test-support";

test("no cutoff (or invalid cutoff) means everything is OFF, even with LIVE configured", async () => {
  const missing = createConfig(
    { EMAIL_RELATIONSHIP_START_AT: undefined, EMAIL_WELCOME_MODE: "LIVE" },
    { production: true },
  );
  assert.equal(await missing.getEffectiveMode("WELCOME"), "OFF");
  assert.deepEqual(await missing.getEnabledKinds(), []);

  const invalid = createConfig(
    { EMAIL_RELATIONSHIP_START_AT: "not-a-date", EMAIL_WELCOME_MODE: "LIVE" },
    { production: true },
  );
  assert.equal(await invalid.getEffectiveMode("WELCOME"), "OFF");
});

test("default (no env) is OFF for both kinds", async () => {
  const config = createConfig({}, { production: true });
  assert.equal(await config.getEffectiveMode("WELCOME"), "OFF");
  assert.equal(await config.getEffectiveMode("FEEDBACK_FIRST_USE"), "OFF");
  assert.deepEqual(await config.getEnabledKinds(), []);
});

test("outside production LIVE is downgraded to ALLOWLIST; SHADOW and ALLOWLIST are unchanged", async () => {
  const dev = createConfig({
    EMAIL_WELCOME_MODE: "LIVE",
    EMAIL_FEEDBACK_MODE: "SHADOW",
  });
  assert.equal(await dev.getEffectiveMode("WELCOME"), "ALLOWLIST");
  assert.equal(await dev.getEffectiveMode("FEEDBACK_FIRST_USE"), "SHADOW");

  const prod = createConfig(
    { EMAIL_WELCOME_MODE: "LIVE" },
    { production: true },
  );
  assert.equal(await prod.getEffectiveMode("WELCOME"), "LIVE");
});

test("the two fixed accounts are always blocked; the admin-configured extra blocklist only adds", async () => {
  const config = createConfig({ EMAIL_RELATIONSHIP_BLOCKLIST: "x@y.com" });
  assert.equal(await config.isBlocked("paulo.alozen@gmail.com"), true);
  assert.equal(await config.isBlocked("  CONTATO@earlycv.com.br "), true);
  assert.equal(await config.isBlocked("x@y.com"), true);
  assert.equal(await config.isBlocked("maria@example.com"), false);
});

test("checkSendReadiness is ready only with full infra", async () => {
  const ready = createConfig().checkSendReadiness();
  assert.deepEqual(ready, {
    ready: true,
    contactListName: "earlycv-contacts",
    topicName: "relationship",
  });
});

test("checkSendReadiness blocks on each missing/unsafe item, never falling back", async () => {
  const cases: Array<[Parameters<typeof createConfig>[0], string]> = [
    [{ SES_EMAIL_ENABLED: false }, "ses_disabled"],
    [{ AWS_SES_ACCESS_KEY_ID: undefined }, "ses_credentials_incomplete"],
    [
      { AWS_SES_CONTACT_LIST_NAME: undefined },
      "list_management_not_configured",
    ],
    [
      { AWS_SES_RELATIONSHIP_TOPIC_NAME: undefined },
      "list_management_not_configured",
    ],
    [
      { AWS_SES_RELATIONSHIP_TOPIC_NAME: "product-updates" },
      "relationship_topic_equals_product",
    ],
    [
      { AWS_SES_RELATIONSHIP_FROM_EMAIL: undefined },
      "sender_profile_incomplete",
    ],
    [
      { AWS_SES_RELATIONSHIP_CONFIGURATION_SET: undefined },
      "sender_profile_incomplete",
    ],
    [
      { AWS_SES_RELATIONSHIP_CONFIGURATION_SET: "earlycv-bulk-email" },
      "relationship_config_set_is_shared_tracking_set",
    ],
  ];

  for (const [overrides, reason] of cases) {
    assert.deepEqual(
      createConfig(overrides).checkSendReadiness(),
      { ready: false, reason },
      reason,
    );
  }
});
