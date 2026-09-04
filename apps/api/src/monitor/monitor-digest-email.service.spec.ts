import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { MonitorDigestEmailService } from "./monitor-digest-email.service";

let originalSecret: string | undefined;
let originalFrontendUrl: string | undefined;

beforeEach(() => {
  originalSecret = process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET;
  originalFrontendUrl = process.env.FRONTEND_URL;
  process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET = "test-secret";
  process.env.FRONTEND_URL = "https://earlycv.com.br";
});

afterEach(() => {
  process.env.MONITOR_DIGEST_UNSUBSCRIBE_SECRET = originalSecret;
  process.env.FRONTEND_URL = originalFrontendUrl;
});

function buildRecommendation(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    recommendation: {
      id,
      opportunityLevel: 4,
      job: { title: `Vaga ${id}`, company: { name: "Acme" } },
      ...overrides,
    },
  };
}

function createFixture(options: {
  recommendationCount: number;
  emailEnabled?: boolean;
  entitled?: boolean;
}) {
  const digest = {
    id: "digest-1",
    userId: "user-1",
    user: { id: "user-1", email: "user@example.com", name: "User" },
    recommendations: Array.from(
      { length: options.recommendationCount },
      (_, i) => buildRecommendation(`rec-${i}`),
    ),
  };

  const sendCalls: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    headers?: Record<string, string>;
    idempotencyKey?: string;
  }[] = [];

  const database = {
    monitorDigest: {
      findUnique: async () => digest,
    },
    monitorAlertPreference: {
      findUnique: async () => ({
        userId: "user-1",
        emailEnabled: options.emailEnabled ?? true,
      }),
    },
    // null simula a tabela sem a linha singleton (defesa em profundidade)
    // — o service cai pros defaults hardcoded, testados por essas specs.
    monitorDigestEmailContent: {
      findUnique: async () => null,
    },
  };

  const emailDelivery = {
    send: async (message: {
      to: string;
      subject: string;
      text: string;
      html?: string;
      headers?: Record<string, string>;
      idempotencyKey?: string;
    }) => {
      sendCalls.push(message);
      return { providerMessageId: "email_abc123" };
    },
  };

  const entitlementService = {
    canUseMonitor: async () => ({
      allowed: options.entitled ?? true,
      reason: (options.entitled ?? true) ? "internal_access" : "none",
    }),
  };

  const service = new MonitorDigestEmailService(
    database as never,
    emailDelivery as never,
    entitlementService as never,
  );

  return { database, sendCalls, service };
}

test("sends the digest email and returns the provider's message id", async () => {
  const { sendCalls, service } = createFixture({ recommendationCount: 2 });

  const result = await service.sendDigest("digest-1");

  assert.deepEqual(result, { sent: true, providerMessageId: "email_abc123" });
  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0].to, "user@example.com");
});

test("subject reflects the total number of recommendations, singular vs plural", async () => {
  const { sendCalls, service } = createFixture({ recommendationCount: 1 });
  await service.sendDigest("digest-1");
  assert.match(sendCalls[0].subject, /1 nova oportunidade/);

  const { sendCalls: sendCalls2, service: service2 } = createFixture({
    recommendationCount: 4,
  });
  await service2.sendDigest("digest-1");
  assert.match(sendCalls2[0].subject, /4 novas oportunidades/);
});

test("body previews at most 5 recommendations even when more are included in the digest", async () => {
  const { sendCalls, service } = createFixture({ recommendationCount: 8 });

  await service.sendDigest("digest-1");

  const text = sendCalls[0].text;
  const jobLines = text.split("\n").filter((line) => line.startsWith("- Vaga"));
  assert.equal(jobLines.length, 5);
  assert.match(text, /\+ 3 outras no seu Alerta de Vaga Certa\./);
});

test("does not send (and reports email_disabled) when the user's preference has emailEnabled=false at send time", async () => {
  const { sendCalls, service } = createFixture({
    recommendationCount: 2,
    emailEnabled: false,
  });

  const result = await service.sendDigest("digest-1");

  assert.deepEqual(result, { sent: false, skippedReason: "email_disabled" });
  assert.equal(sendCalls.length, 0);
});

test("never sends an empty digest, even if one were somehow created with zero recommendations", async () => {
  const { sendCalls, service } = createFixture({ recommendationCount: 0 });

  const result = await service.sendDigest("digest-1");

  assert.equal(result.sent, false);
  assert.equal(sendCalls.length, 0);
});

test("the CTA link carries the required UTMs and the opaque digest id, with no PII", async () => {
  const { sendCalls, service } = createFixture({ recommendationCount: 1 });

  await service.sendDigest("digest-1");

  const text = sendCalls[0].text;
  assert.match(text, /utm_source=monitor_email/);
  assert.match(text, /utm_medium=email/);
  assert.match(text, /utm_campaign=monitor_digest/);
  assert.match(text, /utm_content=digest-1/);
  assert.doesNotMatch(text, /user@example\.com/);
  assert.doesNotMatch(text, /user-1/);
});

test("includes a functional unsubscribe link in both text and html", async () => {
  const { sendCalls, service } = createFixture({ recommendationCount: 1 });

  await service.sendDigest("digest-1");

  assert.match(sendCalls[0].text, /\/api\/monitor\/unsubscribe\?token=/);
  assert.match(sendCalls[0].html ?? "", /\/api\/monitor\/unsubscribe\?token=/);
});

test("sets List-Unsubscribe and List-Unsubscribe-Post headers (RFC 8058 one-click) pointing at the same link shown in the body", async () => {
  const { sendCalls, service } = createFixture({ recommendationCount: 1 });

  await service.sendDigest("digest-1");

  const headers = sendCalls[0].headers;
  assert.ok(headers);
  assert.match(
    headers?.["List-Unsubscribe"] ?? "",
    /^<.*\/api\/monitor\/unsubscribe\?token=.*>$/,
  );
  assert.equal(
    headers?.["List-Unsubscribe-Post"],
    "List-Unsubscribe=One-Click",
  );

  const unsubscribeUrlInBody = (sendCalls[0].text.match(/Cancelar: (\S+)/) ??
    [])[1];
  assert.ok(unsubscribeUrlInBody);
  assert.equal(headers?.["List-Unsubscribe"], `<${unsubscribeUrlInBody}>`);
});

test("passes a stable, PII-free idempotencyKey derived only from the digest id", async () => {
  const { sendCalls, service } = createFixture({ recommendationCount: 1 });

  await service.sendDigest("digest-1");

  assert.equal(sendCalls[0].idempotencyKey, "monitor-digest:digest-1");
});

test("the idempotencyKey is identical across repeated calls for the same digest (retry safety)", async () => {
  const { sendCalls, service } = createFixture({ recommendationCount: 1 });

  await service.sendDigest("digest-1");
  await service.sendDigest("digest-1");

  assert.equal(sendCalls[0].idempotencyKey, sendCalls[1].idempotencyKey);
});

test("uses the admin-configured subject template and intro text when the singleton row exists", async () => {
  const { database, sendCalls, service } = createFixture({
    recommendationCount: 4,
  });
  database.monitorDigestEmailContent.findUnique = async () => ({
    subject: "Vagas novas pra você — {count} oportunidades",
    introText: "Separamos o que combina mais com seu perfil.",
  });

  await service.sendDigest("digest-1");

  assert.equal(sendCalls[0].subject, "Vagas novas pra você — 4 oportunidades");
  assert.match(
    sendCalls[0].text,
    /Separamos o que combina mais com seu perfil\./,
  );
  assert.match(
    sendCalls[0].html ?? "",
    /Separamos o que combina mais com seu perfil\./,
  );
});

test("a single recommendation always uses the fixed singular subject, ignoring the admin's template", async () => {
  const { database, sendCalls, service } = createFixture({
    recommendationCount: 1,
  });
  database.monitorDigestEmailContent.findUnique = async () => ({
    subject: "Vagas novas pra você — {count} oportunidades",
    introText: "",
  });

  await service.sendDigest("digest-1");

  assert.equal(
    sendCalls[0].subject,
    "Encontramos 1 nova oportunidade para você",
  );
});

test("does not send (and reports not_entitled) when the user has lost Monitor entitlement by send time", async () => {
  const { sendCalls, service } = createFixture({
    recommendationCount: 2,
    entitled: false,
  });

  const result = await service.sendDigest("digest-1");

  assert.deepEqual(result, { sent: false, skippedReason: "not_entitled" });
  assert.equal(sendCalls.length, 0);
});
