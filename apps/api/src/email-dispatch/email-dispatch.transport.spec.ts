import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { EmailDispatchConfigService } from "./email-dispatch.config";
import { baseUser, createFixture, NOW } from "./email-dispatch.fixtures";
import type { Row } from "./email-dispatch.test-support";

// Transporte fake fora de produção: configuração + comportamento por tipo.

let originalAppEnv: string | undefined;
beforeEach(() => {
  originalAppEnv = process.env.APP_ENV;
});
afterEach(() => {
  if (originalAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = originalAppEnv;
});

function realConfig(env: Record<string, string | undefined> = {}) {
  return new EmailDispatchConfigService(
    {
      EMAIL_RELATIONSHIP_START_AT: "2026-10-01T00:00:00.000Z",
      EMAIL_WELCOME_MODE: "LIVE",
      EMAIL_FEEDBACK_MODE: "LIVE",
      EMAIL_PURCHASE_CONFIRMATION_MODE: "LIVE",
      ...env,
    },
    {
      isSesEnabled: () => true,
      getSesClientConfig: () => ({
        region: "us-east-2",
        accessKeyId: "k",
        secretAccessKey: "s",
      }),
      getSesSenderProfile: () => ({
        fromEmail: "contato@earlycv.com.br",
        fromName: "Paulo do EarlyCV",
        configurationSet: "earlycv-relationship-email",
      }),
    },
  );
}

test("real transport is allowed ONLY when APP_ENV is exactly 'production' — unset, development, staging, homolog, test all stay fake", () => {
  for (const value of [
    undefined,
    "",
    "development",
    "staging",
    "homolog",
    "test",
    "Production ",
    "prod",
  ]) {
    if (value === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = value;
    assert.equal(
      realConfig().isRealTransportAllowed(),
      false,
      `APP_ENV=${value}`,
    );
  }
  process.env.APP_ENV = "production";
  assert.equal(realConfig().isRealTransportAllowed(), true);
});

test("outside production every configured LIVE is downgraded to ALLOWLIST for ALL THREE kinds", () => {
  process.env.APP_ENV = "staging";
  const config = realConfig();
  for (const kind of [
    "WELCOME",
    "FEEDBACK_FIRST_USE",
    "PURCHASE_CONFIRMATION",
  ] as const) {
    assert.equal(config.getEffectiveMode(kind), "ALLOWLIST", kind);
  }
  process.env.APP_ENV = "production";
  for (const kind of [
    "WELCOME",
    "FEEDBACK_FIRST_USE",
    "PURCHASE_CONFIRMATION",
  ] as const) {
    assert.equal(config.getEffectiveMode(kind), "LIVE", kind);
  }
});

test("outside production, due rows of ALL THREE kinds in ALLOWLIST/LIVE become SENT with a fake id and NOTHING reaches any provider", async () => {
  const f = createFixture({
    env: {
      EMAIL_WELCOME_MODE: "LIVE",
      EMAIL_FEEDBACK_MODE: "LIVE",
      EMAIL_PURCHASE_CONFIRMATION_MODE: "LIVE",
      EMAIL_RELATIONSHIP_ALLOWLIST: "maria@example.com",
    },
    production: false,
    users: [baseUser()],
    purchases: [
      {
        id: "p1",
        userId: "user_1",
        status: "completed",
        createdAt: new Date("2026-10-04T12:00:00.000Z"),
      } as Row,
    ],
  });
  const payload = {
    planType: "pro",
    amountInCents: 4990,
    currency: "BRL",
    credits: 5,
    analysisCredits: 5,
    isUnlimited: false,
    isCouponRedemption: false,
  };
  await f.addDispatch({ kind: "WELCOME", dedupeKey: "welcome:user_1" });
  await f.addDispatch({
    kind: "PURCHASE_CONFIRMATION",
    dedupeKey: "purchase:p1",
    referenceId: "p1",
    payloadJson: payload,
  });
  // O feedback precisa estar no horário (08–20 BRT) e depois da boas-vindas.
  await f.addDispatch({
    kind: "FEEDBACK_FIRST_USE",
    dedupeKey: "feedback:user_1",
  });

  await f.worker.processBatch(NOW);
  // 2ª rodada: o feedback espera a boas-vindas (regra normal) e sai depois.
  await f.worker.processBatch(new Date(NOW.getTime() + 13 * 3_600_000));

  assert.equal(f.sent.length, 0, "nenhuma chamada ao provider");
  for (const row of f.emailDispatch.rows) {
    if (row.status === "SENT") {
      assert.equal(row.providerMessageId.startsWith("fake:"), true, row.kind);
    }
  }
  const sentKinds = f.emailDispatch.rows
    .filter((r) => r.status === "SENT")
    .map((r) => r.kind)
    .sort();
  assert.deepEqual(sentKinds, [
    "FEEDBACK_FIRST_USE",
    "PURCHASE_CONFIRMATION",
    "WELCOME",
  ]);
});

test("boot log states the activation state: modes, cutoff and transport (real/fake) — no secrets", () => {
  process.env.APP_ENV = "staging";
  const f = createFixture({ env: { EMAIL_WELCOME_MODE: "SHADOW" } });
  const lines: string[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: acesso ao logger privado no teste
  (f.worker as any).logger = {
    log: (m: string) => lines.push(m),
    warn: (m: string) => lines.push(m),
  };

  f.worker.onModuleInit();

  assert.equal(lines.length, 1);
  assert.match(
    lines[0],
    /^email_dispatch_boot welcome=SHADOW feedback=OFF purchase=OFF startAt=2026-10-01T00:00:00.000Z transport=fake$/,
  );
  assert.doesNotMatch(lines[0], /secret|key|@/i);
});

test("boot log (production) warns when a ligado kind cannot send because the infra is incomplete", () => {
  const f = createFixture({
    env: {
      EMAIL_FEEDBACK_MODE: "LIVE",
      AWS_SES_RELATIONSHIP_CONFIGURATION_SET: "earlycv-bulk-email",
    },
    production: true,
  });
  const lines: string[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: acesso ao logger privado no teste
  (f.worker as any).logger = {
    log: (m: string) => lines.push(m),
    warn: (m: string) => lines.push(m),
  };
  const original = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  f.worker.onModuleInit();

  if (original !== undefined) process.env.RESEND_API_KEY = original;
  assert.match(lines[0], /transport=real/);
  assert.ok(
    lines.some(
      (l) =>
        l ===
        "email_dispatch_not_ready kind=FEEDBACK_FIRST_USE reason=relationship_config_set_is_shared_tracking_set",
    ),
  );
});
