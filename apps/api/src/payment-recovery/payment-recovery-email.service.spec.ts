import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";
import { PaymentRecoveryEmailService } from "./payment-recovery-email.service";
import { buildPaymentRecoveryEmailCopy } from "./payment-recovery-email-copy";

function makeService(options?: {
  emailEnabled?: boolean;
  dryRun?: boolean;
  allowlist?: string[];
  eligibilityStatus?: "eligible" | "possibly_resolved" | "not_eligible";
  ignored?: boolean;
  priorEmails?: Record<string, unknown>[];
}) {
  const emails: Record<string, unknown>[] = [];
  const tokens: Record<string, unknown>[] = [];
  const db = {
    planPurchase: {
      findUnique: async () => ({
        id: "purchase-1",
        userId: "user-1",
        originAction: "unlock_cv",
        originAdaptationId: "adapt-1",
        user: { id: "user-1", email: "user@example.com", name: "Joao Silva" },
      }),
    },
    cvAdaptation: {
      findUnique: async () => ({
        id: "adapt-1",
        jobTitle: "Data Analyst",
        adaptedContentJson: { scoreBefore: 35, scoreAfter: 60, scoreDelta: 25 },
      }),
    },
    paymentRecoveryEmail: {
      findMany: async () => [...(options?.priorEmails ?? []), ...emails],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `email-${emails.length + 1}`,
          ...data,
          createdAt: new Date(),
        };
        emails.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = emails.find((item) => item.id === where.id);
        Object.assign(row, data);
      },
    },
    paymentRecoveryToken: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `token-${tokens.length + 1}`, ...data };
        tokens.push(row);
        return row;
      },
      update: async () => undefined,
    },
    $executeRawUnsafe: async () => undefined,
  };
  db.$transaction = async (callback: (tx: typeof db) => Promise<unknown>) =>
    callback(db);

  const config = {
    isEmailEnabled: () => options?.emailEnabled ?? true,
    isDryRun: () => options?.dryRun ?? false,
    emailAllowlist: () => options?.allowlist ?? [],
    tokenTtlDays: () => 7,
  };

  const eligibility = {
    evaluateByPurchaseId: async () => ({
      item: {
        purchaseId: "purchase-1",
        eligibilityStatus: options?.eligibilityStatus ?? "eligible",
        eligibilityReason: "pending_unlock_cv_not_unlocked",
        ignored: options?.ignored ?? false,
      },
      recoveryGroupKey: "user-1:adapt-1",
      groupPurchaseIds: ["purchase-1"],
    }),
  };

  return {
    service: new PaymentRecoveryEmailService(
      db as unknown as ConstructorParameters<
        typeof PaymentRecoveryEmailService
      >[0],
      config as unknown as ConstructorParameters<
        typeof PaymentRecoveryEmailService
      >[1],
      eligibility as unknown as ConstructorParameters<
        typeof PaymentRecoveryEmailService
      >[2],
    ),
    emails,
    tokens,
  };
}

test("EMAIL_ENABLED=false returns skipped and no real send", async () => {
  const { service, emails } = makeService({ emailEnabled: false });
  const result = await service.send({
    purchaseId: "purchase-1",
    adminUserId: "admin-1",
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "email_disabled");
  assert.equal(result.realEmailSent, false);
  assert.equal(emails[0].realEmailSent, false);
});

test("DRY_RUN true outside allowlist no real send", async () => {
  const { service } = makeService({
    dryRun: true,
    allowlist: ["ops@example.com"],
  });
  const result = await service.send({
    purchaseId: "purchase-1",
    adminUserId: "admin-1",
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.allowlistMatched, false);
  assert.equal(result.realEmailSent, false);
});

test("DRY_RUN true inside allowlist skips real send", async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = (async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({ id: "provider-1" }) };
  }) as typeof fetch;
  const { service } = makeService({
    dryRun: true,
    allowlist: ["user@example.com"],
  });
  const result = await service.send({
    purchaseId: "purchase-1",
    adminUserId: "admin-1",
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.realEmailSent, false);
  assert.equal(result.reason, "dry_run");
  assert.equal(fetchCalled, false);
  global.fetch = originalFetch;
});

test("recovery link points to public payment recovery endpoint", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalApiUrl = process.env.API_URL;
  process.env.NODE_ENV = "production";
  process.env.APP_ENV = "production";
  process.env.FRONTEND_URL = "https://earlycv.com.br";
  process.env.API_URL = "https://api.earlycv.com.br";

  const originalFetch = global.fetch;
  let payload: Record<string, unknown> | null = null;
  global.fetch = (async (_url: string, init?: RequestInit) => {
    payload = JSON.parse(String(init?.body ?? "{}"));
    return { ok: true, json: async () => ({ id: "provider-link" }) };
  }) as typeof fetch;

  try {
    const { service } = makeService();
    const result = await service.send({
      purchaseId: "purchase-1",
      adminUserId: "admin-1",
    });
    assert.equal(result.status, "sent");
    assert.equal(typeof payload?.text, "string");
    assert.equal(
      payload.text.includes("https://earlycv.com.br/recovery/"),
      true,
    );
  } finally {
    global.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.APP_ENV = originalAppEnv;
    process.env.FRONTEND_URL = originalFrontendUrl;
    process.env.API_URL = originalApiUrl;
  }
});

test("eligibility possibly_resolved/not_eligible and ignored block real send", async () => {
  const a = await makeService({
    eligibilityStatus: "possibly_resolved",
  }).service.send({ purchaseId: "purchase-1", adminUserId: "admin-1" });
  const b = await makeService({
    eligibilityStatus: "not_eligible",
  }).service.send({ purchaseId: "purchase-1", adminUserId: "admin-1" });
  const c = await makeService({ ignored: true }).service.send({
    purchaseId: "purchase-1",
    adminUserId: "admin-1",
  });
  assert.equal(a.status, "skipped");
  assert.equal(b.status, "skipped");
  assert.equal(c.reason, "ignored");
});

test("second real send same group blocked already_sent and cooldown blocks repeated attempt", async () => {
  const recent = { realEmailSent: false, createdAt: new Date() };
  const oldReal = {
    realEmailSent: true,
    createdAt: new Date(Date.now() - 3600_000),
  };
  const first = await makeService({ priorEmails: [oldReal] }).service.send({
    purchaseId: "purchase-1",
    adminUserId: "admin-1",
  });
  const second = await makeService({ priorEmails: [recent] }).service.send({
    purchaseId: "purchase-1",
    adminUserId: "admin-1",
  });
  assert.equal(first.reason, "already_sent");
  assert.equal(second.reason, "cooldown_active");
});

test("force resend bypasses already_sent and cooldown guards", async () => {
  const oldReal = {
    realEmailSent: true,
    createdAt: new Date(Date.now() - 3_600_000),
  };
  const recent = { realEmailSent: false, createdAt: new Date() };

  const originalNodeEnv = process.env.NODE_ENV;
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalApiUrl = process.env.API_URL;
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_URL = "https://earlycv.com.br";
  process.env.API_URL = "https://api.earlycv.com.br";

  const originalFetch = global.fetch;
  global.fetch = (async () => ({
    ok: true,
    json: async () => ({ id: "provider-force" }),
  })) as typeof fetch;

  try {
    const first = await makeService({ priorEmails: [oldReal] }).service.send({
      purchaseId: "purchase-1",
      adminUserId: "admin-1",
      forceResend: true,
    });
    const second = await makeService({ priorEmails: [recent] }).service.send({
      purchaseId: "purchase-1",
      adminUserId: "admin-1",
      forceResend: true,
    });
    assert.equal(first.status, "sent");
    assert.equal(second.status, "sent");
  } finally {
    global.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.FRONTEND_URL = originalFrontendUrl;
    process.env.API_URL = originalApiUrl;
  }
});

test("transactional gate re-check prevents duplicate real send on double attempt", async () => {
  const { service, emails } = makeService();
  const originalFetch = global.fetch;
  global.fetch = (async () => ({
    ok: true,
    json: async () => ({ id: "provider-3" }),
  })) as typeof fetch;

  const first = await service.send({
    purchaseId: "purchase-1",
    adminUserId: "admin-1",
  });
  assert.equal(first.status, "sent");

  const second = await service.send({
    purchaseId: "purchase-1",
    adminUserId: "admin-1",
  });
  assert.equal(second.status, "skipped");
  assert.equal(
    second.reason === "already_sent" || second.reason === "cooldown_active",
    true,
  );
  assert.equal(emails.filter((row) => row.realEmailSent === true).length, 1);

  global.fetch = originalFetch;
});

test("real send creates email and token; token persisted as hash", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => ({
    ok: true,
    json: async () => ({ id: "provider-2" }),
  })) as typeof fetch;
  const { service, emails, tokens } = makeService();
  const result = await service.send({
    purchaseId: "purchase-1",
    adminUserId: "admin-1",
  });
  assert.equal(result.status, "sent");
  assert.equal(emails.length, 1);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].tokenHash.length, 64);
  assert.equal(tokens[0].tokenHash.includes("/recovery/"), false);
  global.fetch = originalFetch;
});

test("provider failure returns failed with error message", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalApiUrl = process.env.API_URL;
  process.env.NODE_ENV = "production";
  process.env.APP_ENV = "production";
  process.env.FRONTEND_URL = "https://earlycv.com.br";
  process.env.API_URL = "https://api.earlycv.com.br";

  const originalFetch = global.fetch;
  global.fetch = (async () => ({
    ok: false,
    status: 500,
    json: async () => ({ message: "boom" }),
  })) as typeof fetch;
  const { service, emails } = makeService();
  const result = await service.send({
    purchaseId: "purchase-1",
    adminUserId: "admin-1",
  });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "provider_failure");
  assert.equal(emails[0].errorMessage, "boom");
  global.fetch = originalFetch;
  process.env.NODE_ENV = originalNodeEnv;
  process.env.APP_ENV = originalAppEnv;
  process.env.FRONTEND_URL = originalFrontendUrl;
  process.env.API_URL = originalApiUrl;
});

test("local environment mocks email send and logs payload", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  const originalFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error("fetch should not be called in local mock");
  }) as typeof fetch;

  const originalInfo = console.info;
  const infoCalls: string[] = [];
  console.info = ((message: string) => {
    infoCalls.push(String(message));
  }) as typeof console.info;

  try {
    const { service, emails } = makeService();
    const result = await service.send({
      purchaseId: "purchase-1",
      adminUserId: "admin-1",
    });
    assert.equal(result.status, "sent");
    assert.equal(result.realEmailSent, true);
    assert.equal(
      (emails[0]?.providerMessageId ?? "").startsWith("mock-local-"),
      true,
    );
    assert.equal(infoCalls.length > 0, true);
    assert.equal(
      infoCalls.some((entry) =>
        entry.includes("[payment-recovery-email-mock]"),
      ),
      true,
    );
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    global.fetch = originalFetch;
    console.info = originalInfo;
  }
});

test("copy supports jobTitle fallback and score sentence variants without forbidden phrases", () => {
  const a = buildPaymentRecoveryEmailCopy({
    firstName: null,
    jobTitle: null,
    scoreBefore: 10,
    scoreAfter: 20,
    scoreDelta: null,
    recoveryLink: "https://x",
  });
  const b = buildPaymentRecoveryEmailCopy({
    firstName: "Ana",
    jobTitle: "Engenheira",
    scoreBefore: null,
    scoreAfter: null,
    scoreDelta: 12,
    recoveryLink: "https://x",
  });
  assert.equal(a.subject.includes("esta vaga"), true);
  assert.equal(a.text.includes("tudo bem"), true);
  assert.equal(b.text.includes("+12 pontos"), true);
  assert.equal(a.text.includes("improvementPercent"), false);
  assert.equal(a.text.toLowerCase().includes("company"), false);
  assert.equal(a.html.includes("Retomar pagamento agora"), true);
  assert.equal(a.html.includes('<a href="https://x"'), true);
});
