import assert from "node:assert/strict";
import { test } from "node:test";

import { PaymentRecoveryClickService } from "./payment-recovery-click.service";

type ClickDeps = ConstructorParameters<typeof PaymentRecoveryClickService>;

function createService(overrides?: {
  findToken?: (where: Record<string, unknown>) => Promise<unknown>;
  updateToken?: (args: Record<string, unknown>) => Promise<unknown>;
  updateEmail?: (args: Record<string, unknown>) => Promise<unknown>;
}) {
  const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const database = {
    paymentRecoveryToken: {
      findUnique: overrides?.findToken ?? (async () => null),
      update: overrides?.updateToken ?? (async () => ({})),
    },
    paymentRecoveryEmail: {
      findUnique: async () => ({
        id: "email-1",
        clickedAt: null,
        metadataJson: { keep: "yes" },
      }),
      update: overrides?.updateEmail ?? (async () => ({})),
    },
    planPurchase: {
      findUnique: async () => ({
        id: "purchase-1",
        status: "pending",
        userId: "user-1",
        originAction: "unlock_cv",
      }),
    },
    user: {
      findUnique: async () => ({ id: "user-1" }),
    },
    cvAdaptation: {
      findUnique: async () => ({ id: "adapt-1", isUnlocked: false }),
    },
  } as ClickDeps[0];

  const service = new PaymentRecoveryClickService(database, {
    emit: (event: string, payload: Record<string, unknown>) => {
      events.push({ event, payload });
    },
  } as ClickDeps[1]);

  return { service, events };
}

test("invalid token returns generic redirect and emits invalid event", async () => {
  const { service, events } = createService();
  const result = await service.handleTokenClick({
    token: "bad-token",
    ip: "1.1.1.1",
  });

  assert.equal(result.redirectTarget, "generic");
  assert.match(result.redirectUrl, /\/recuperar-pagamento/);
  assert.equal(
    events.some((entry) => entry.event === "payment_recovery_token_invalid"),
    true,
  );
});

test("expired token returns generic redirect, no checkout resume, emits expired", async () => {
  const { service, events } = createService({
    findToken: async () => ({
      id: "tok-1",
      expiresAt: new Date(Date.now() - 60_000),
      purchaseId: "purchase-1",
      userId: "user-1",
      adaptationId: "adapt-1",
      emailRecordId: "email-1",
      recoveryGroupKey: "g1",
    }),
  });

  const result = await service.handleTokenClick({
    token: "a".repeat(64),
    ip: "1.1.1.1",
    currentUserId: "user-1",
  });

  assert.equal(result.redirectTarget, "generic");
  assert.equal(
    events.some((entry) => entry.event === "payment_recovery_token_expired"),
    true,
  );
});

test("pending valid token records click and redirects to bridge", async () => {
  let emailUpdatePayload: Record<string, unknown> | null = null;
  const { service, events } = createService({
    findToken: async () => ({
      id: "tok-1",
      expiresAt: new Date(Date.now() + 60_000),
      purchaseId: "purchase-1",
      userId: "user-1",
      adaptationId: "adapt-1",
      emailRecordId: "email-1",
      recoveryGroupKey: "g1",
    }),
    updateEmail: async (args) => {
      emailUpdatePayload = args;
      return {};
    },
  });

  const result = await service.handleTokenClick({
    token: "a".repeat(64),
    ip: "1.1.1.1",
    currentUserId: "user-1",
  });

  assert.equal(result.redirectTarget, "checkout");
  assert.match(result.redirectUrl, /\/api\/payment-recovery\/bridge\//);
  assert.equal(Boolean(emailUpdatePayload), true);
  assert.equal(
    events.some((entry) => entry.event === "payment_recovery_email_clicked"),
    true,
  );
});

test("token is not consumed and multiple clicks update lastClickedAt", async () => {
  let tokenUpdated = false;
  const updatePayloads: Record<string, unknown>[] = [];
  const tokenRecord = {
    id: "tok-1",
    expiresAt: new Date(Date.now() + 60_000),
    purchaseId: "purchase-1",
    userId: "user-1",
    adaptationId: "adapt-1",
    emailRecordId: "email-1",
    recoveryGroupKey: "g1",
  };
  const { service } = createService({
    findToken: async () => tokenRecord,
    updateToken: async (args) => {
      tokenUpdated = true;
      updatePayloads.push(args);
      return {};
    },
    updateEmail: async (args) => {
      updatePayloads.push(args);
      return {};
    },
  });

  await service.handleTokenClick({ token: "a".repeat(64), ip: "1.1.1.1" });
  await service.handleTokenClick({ token: "a".repeat(64), ip: "1.1.1.1" });

  assert.equal(tokenUpdated, false);
  assert.equal(updatePayloads.length >= 2, true);
});

test("click metadata merge preserves existing keys", async () => {
  let updatePayload: Record<string, unknown> | null = null;
  const { service } = createService({
    findToken: async () => ({
      id: "tok-1",
      expiresAt: new Date(Date.now() + 60_000),
      purchaseId: "purchase-1",
      userId: "user-1",
      adaptationId: "adapt-1",
      emailRecordId: "email-1",
      recoveryGroupKey: "g1",
    }),
    updateEmail: async (args) => {
      updatePayload = args;
      return {};
    },
  });
  await service.handleTokenClick({
    token: "a".repeat(64),
    currentUserId: "user-1",
  });
  assert.equal(
    (
      (
        (updatePayload?.data as Record<string, unknown>)
          ?.metadataJson as Record<string, unknown>
      )?.set as Record<string, unknown>
    )?.keep,
    "yes",
  );
  assert.equal(
    typeof (
      (
        (updatePayload?.data as Record<string, unknown>)
          ?.metadataJson as Record<string, unknown>
      )?.set as Record<string, unknown>
    )?.lastClickedAt,
    "string",
  );
});

test("approved purchase redirects to success when adaptation already unlocked", async () => {
  const { service, events } = createService({
    findToken: async () => ({
      id: "tok-1",
      expiresAt: new Date(Date.now() + 60_000),
      purchaseId: "purchase-1",
      userId: "user-1",
      adaptationId: "adapt-1",
      emailRecordId: "email-1",
      recoveryGroupKey: "g1",
    }),
  });

  const serviceDb = (
    service as unknown as { database: Record<string, Record<string, unknown>> }
  ).database;
  serviceDb.planPurchase.findUnique = async () => ({
    id: "purchase-1",
    status: "completed",
    userId: "user-1",
    originAction: "unlock_cv",
  });
  serviceDb.cvAdaptation.findUnique = async () => ({
    id: "adapt-1",
    isUnlocked: true,
  });

  const result = await service.handleTokenClick({
    token: "a".repeat(64),
    ip: "1.1.1.1",
    currentUserId: "user-1",
  });
  assert.equal(result.redirectTarget, "completed");
  assert.match(
    result.redirectUrl,
    /\/adaptar\/resultado\?adaptationId=adapt-1/,
  );
  assert.equal(
    events.some(
      (entry) => entry.event === "payment_recovery_click_redirected_completed",
    ),
    true,
  );
});

test("canceled or refunded purchase returns generic", async () => {
  const { service } = createService({
    findToken: async () => ({
      id: "tok-1",
      expiresAt: new Date(Date.now() + 60_000),
      purchaseId: "purchase-1",
      userId: "user-1",
      adaptationId: "adapt-1",
      emailRecordId: "email-1",
      recoveryGroupKey: "g1",
    }),
  });
  const serviceDb = (
    service as unknown as { database: Record<string, Record<string, unknown>> }
  ).database;
  serviceDb.planPurchase.findUnique = async () => ({
    id: "purchase-1",
    status: "refunded",
    userId: "user-1",
    originAction: "unlock_cv",
  });
  const result = await service.handleTokenClick({
    token: "a".repeat(64),
    ip: "1.1.1.1",
  });
  assert.equal(result.redirectTarget, "generic");
});

test("logged out redirects to login with safe internal return url", async () => {
  const { service } = createService({
    findToken: async () => ({
      id: "tok-1",
      expiresAt: new Date(Date.now() + 60_000),
      purchaseId: "purchase-1",
      userId: "user-1",
      adaptationId: "adapt-1",
      emailRecordId: "email-1",
      recoveryGroupKey: "g1",
    }),
  });

  const result = await service.handleTokenClick({
    token: "a".repeat(64),
    ip: "1.1.1.1",
    currentUserId: null,
    returnUrl: "https://evil.com",
  });
  assert.equal(result.redirectTarget, "login");
  assert.match(
    result.redirectUrl,
    /\/entrar\?tab=entrar&next=%2Fapi%2Fpayment-recovery%2Fbridge%2Fa{64}/,
  );
});

test("logged in as different user gets blocked and mismatch event emitted", async () => {
  const { service, events } = createService({
    findToken: async () => ({
      id: "tok-1",
      expiresAt: new Date(Date.now() + 60_000),
      purchaseId: "purchase-1",
      userId: "user-1",
      adaptationId: "adapt-1",
      emailRecordId: "email-1",
      recoveryGroupKey: "g1",
    }),
  });

  const result = await service.handleTokenClick({
    token: "a".repeat(64),
    ip: "1.1.1.1",
    currentUserId: "user-other",
  });

  assert.equal(result.redirectTarget, "generic");
  assert.equal(
    events.some(
      (entry) => entry.event === "payment_recovery_token_user_mismatch",
    ),
    true,
  );
});
