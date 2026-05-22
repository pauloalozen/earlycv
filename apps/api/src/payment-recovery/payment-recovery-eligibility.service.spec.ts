import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { PaymentRecoveryEligibilityService } from "./payment-recovery-eligibility.service";

type MockDb = {
  planPurchase: {
    findMany: (args?: any) => Promise<any[]>;
    findUnique: (args?: any) => Promise<any | null>;
  };
  paymentRecoveryEmail: { findMany: (args?: unknown) => Promise<any[]> };
  cvAdaptation: {
    findMany: (args?: unknown) => Promise<any[]>;
    findUnique: (args?: any) => Promise<any | null>;
  };
  paymentRecoveryIgnore: { findMany: (args?: unknown) => Promise<any[]> };
};

function createService(data: {
  purchases: any[];
  emails?: any[];
  ignores?: any[];
}) {
  const db: MockDb = {
    planPurchase: {
      findMany: async ({ where }: any = {}) => {
        if (!where) return data.purchases;
        return data.purchases.filter((purchase) => {
          if (where.userId && purchase.userId !== where.userId) return false;
          if (where.originAdaptationId !== undefined) {
            if (purchase.originAdaptationId !== where.originAdaptationId) return false;
          }
          if (where.originAction && purchase.originAction !== where.originAction) return false;
          if (where.id && purchase.id !== where.id) return false;
          return true;
        });
      },
      findUnique: async ({ where }: any = {}) =>
        data.purchases.find((purchase) => purchase.id === where?.id) ?? null,
    },
    paymentRecoveryEmail: {
      findMany: async ({ where }: any = {}) => {
        const items = data.emails ?? [];
        const ids = where?.purchaseId?.in;
        if (!Array.isArray(ids)) {
          return items;
        }
        return items.filter((item) => ids.includes(item.purchaseId));
      },
    },
    cvAdaptation: {
      findMany: async ({ where }: any = {}) => {
        const ids = where?.id?.in;
        if (!Array.isArray(ids)) {
          return [];
        }
        return data.purchases
          .map((purchase) => purchase.adaptation)
          .filter((adaptation) => adaptation && ids.includes(adaptation.id));
      },
      findUnique: async ({ where }: any = {}) => {
        return (
          data.purchases
            .map((purchase) => purchase.adaptation)
            .find((adaptation) => adaptation?.id === where?.id) ?? null
        );
      },
    },
    paymentRecoveryIgnore: {
      findMany: async ({ where }: any = {}) => {
        const items = data.ignores ?? [];
        const ids = where?.purchaseId?.in;
        if (!Array.isArray(ids)) {
          return items;
        }
        return items.filter((item) => ids.includes(item.purchaseId));
      },
    },
  };

  return new PaymentRecoveryEligibilityService(db as any);
}

function buildPurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: "purchase-1",
    userId: "user-1",
    planType: "pro",
    amountInCents: 2990,
    currency: "BRL",
    paymentProvider: "mercadopago",
    paymentReference: "ref-1",
    status: "pending",
    paidAt: null,
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    creditsGranted: 1,
    mpPaymentId: null,
    mpMerchantOrderId: null,
    mpPreferenceId: "pref-1",
    originAction: "unlock_cv",
    originAdaptationId: "adapt-1",
    user: {
      id: "user-1",
      name: "User One",
      email: "user1@example.com",
      creditsRemaining: 0,
    },
    adaptation: {
      id: "adapt-1",
      userId: "user-1",
      jobTitle: "Data Analyst",
      companyName: "Acme",
      isUnlocked: false,
      adaptedContentJson: {
        scoreBefore: 44,
        scoreAfter: 80,
        scoreDelta: 36,
      },
    },
    ...overrides,
  };
}

test("approved purchase not eligible", async () => {
  const service = createService({
    purchases: [buildPurchase({ status: "completed" })],
  });

  const result = await service.listPending({ eligibilityStatus: "all" });
  assert.equal(result.items.length, 0);
});

test("user without email not eligible", async () => {
  const service = createService({
    purchases: [buildPurchase({ user: { id: "user-1", name: "User One", email: "", creditsRemaining: 0 } })],
  });

  const result = await service.listPending({ eligibilityStatus: "all" });
  assert.equal(result.items[0]?.eligibilityReason, "missing_user_email");
});

test("status none without checkout evidence is not eligible", async () => {
  const service = createService({
    purchases: [
      buildPurchase({
        status: "none",
        paymentReference: "",
        mpPreferenceId: null,
        mpPaymentId: null,
      }),
    ],
  });

  const result = await service.listPending({ eligibilityStatus: "all" });
  assert.equal(result.items[0]?.eligibilityReason, "missing_checkout_context");
});

test("unlock_cv unlocked adaptation not eligible", async () => {
  const service = createService({
    purchases: [buildPurchase({ adaptation: { id: "adapt-1", isUnlocked: true, jobTitle: null, companyName: null, adaptedContentJson: null } })],
  });

  const result = await service.listPending({ eligibilityStatus: "all" });
  assert.equal(result.items[0]?.eligibilityReason, "adaptation_already_unlocked");
});

test("unlock_cv not unlocked is eligible", async () => {
  const service = createService({
    purchases: [buildPurchase()],
  });

  const result = await service.listPending({ eligibilityStatus: "all" });
  assert.equal(result.items[0]?.eligibilityStatus, "eligible");
  assert.equal(result.items[0]?.eligibilityReason, "pending_unlock_cv_not_unlocked");
});

test("unlock_cv user with available credits possibly resolved", async () => {
  const service = createService({
    purchases: [buildPurchase({ user: { id: "user-1", name: "User One", email: "user1@example.com", creditsRemaining: 2 } })],
  });

  const result = await service.listPending({ eligibilityStatus: "all" });
  assert.equal(result.items[0]?.eligibilityStatus, "possibly_resolved");
  assert.equal(result.items[0]?.eligibilityReason, "user_has_available_credits");
});

test("unlock_cv cannot be resolved by unrelated approved purchase", async () => {
  const pending = buildPurchase({ id: "purchase-pending", originAdaptationId: "adapt-1" });
  const approvedOtherAdaptation = buildPurchase({
    id: "purchase-approved",
    status: "completed",
    paidAt: new Date("2026-05-02T10:00:00.000Z"),
    originAdaptationId: "adapt-2",
  });
  const service = createService({
    purchases: [pending, approvedOtherAdaptation],
  });

  const result = await service.listPending({ eligibilityStatus: "all" });
  assert.equal(result.items[0]?.purchaseId, "purchase-pending");
  assert.equal(result.items[0]?.eligibilityStatus, "eligible");
  assert.equal(result.items[0]?.eligibilityReason, "pending_unlock_cv_not_unlocked");
  assert.equal(result.items[0]?.hasApprovedPurchaseAfterPending, false);
});

test("buy_credits with posterior credit possibly resolved", async () => {
  const pending = buildPurchase({
    id: "purchase-pending",
    originAction: "buy_credits",
    originAdaptationId: null,
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
  });
  const approved = buildPurchase({
    id: "purchase-approved",
    originAction: "buy_credits",
    originAdaptationId: null,
    status: "completed",
    paidAt: new Date("2026-05-02T10:00:00.000Z"),
    createdAt: new Date("2026-05-02T10:00:00.000Z"),
  });
  const service = createService({ purchases: [pending, approved] });

  const result = await service.listPending({ eligibilityStatus: "all" });
  assert.equal(result.items[0]?.purchaseId, "purchase-pending");
  assert.equal(result.items[0]?.eligibilityStatus, "possibly_resolved");
  assert.equal(result.items[0]?.eligibilityReason, "approved_purchase_after_pending");
  assert.equal(result.items[0]?.hasApprovedPurchaseAfterPending, true);
});

test("buy_credits without posterior credit eligible", async () => {
  const service = createService({
    purchases: [buildPurchase({ originAction: "buy_credits", originAdaptationId: null })],
  });

  const result = await service.listPending();
  assert.equal(result.items[0]?.eligibilityStatus, "eligible");
  assert.equal(
    result.items[0]?.eligibilityReason,
    "pending_buy_credits_without_posterior_credit",
  );
  assert.equal(result.items[0]?.hasApprovedPurchaseAfterPending, false);
});

test("group history aggregates recovery emails across grouped purchases", async () => {
  const first = buildPurchase({ id: "p-1", createdAt: new Date("2026-05-01T10:00:00.000Z") });
  const second = buildPurchase({ id: "p-2", createdAt: new Date("2026-05-03T10:00:00.000Z") });
  const service = createService({
    purchases: [first, second],
    emails: [
      { purchaseId: "p-1", sentAt: new Date("2026-05-01T11:00:00.000Z"), createdAt: new Date("2026-05-01T11:00:00.000Z") },
      { purchaseId: "p-2", sentAt: new Date("2026-05-03T12:00:00.000Z"), createdAt: new Date("2026-05-03T12:00:00.000Z") },
      { purchaseId: "p-1", sentAt: null, createdAt: new Date("2026-05-01T12:00:00.000Z") },
    ],
  });

  const result = await service.listPending();
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.purchaseId, "p-2");
  assert.equal(result.items[0]?.recoveryEmailCount, 3);
  assert.equal(result.items[0]?.lastRecoveryEmailSentAt, "2026-05-03T12:00:00.000Z");
});

test("terminal-only groups are not included in final output", async () => {
  const service = createService({
    purchases: [buildPurchase({ id: "terminal-1", status: "completed" })],
  });

  const result = await service.listPending();
  assert.equal(result.items.length, 0);
});

test("groups multiple pending same adaptation", async () => {
  const first = buildPurchase({ id: "p-1", createdAt: new Date("2026-05-01T10:00:00.000Z") });
  const second = buildPurchase({ id: "p-2", createdAt: new Date("2026-05-03T10:00:00.000Z") });
  const service = createService({ purchases: [first, second] });

  const result = await service.listPending();
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.purchaseId, "p-2");
  assert.equal(result.items[0]?.relatedPendingPurchaseCount, 2);
});

test("returns recovery email history fields", async () => {
  const service = createService({
    purchases: [buildPurchase({ id: "purchase-1" })],
    emails: [
      { purchaseId: "purchase-1", sentAt: new Date("2026-05-01T11:00:00.000Z"), createdAt: new Date("2026-05-01T11:00:00.000Z") },
      { purchaseId: "purchase-1", sentAt: null, createdAt: new Date("2026-05-01T12:00:00.000Z") },
    ],
  });

  const result = await service.listPending();
  assert.equal(result.items[0]?.recoveryEmailCount, 2);
  assert.equal(result.items[0]?.lastRecoveryEmailSentAt, "2026-05-01T11:00:00.000Z");
});

test("evaluateByPurchaseId returns deterministic item independent from pagination", async () => {
  const target = buildPurchase({ id: "target-1", userId: "user-9" });
  const older = buildPurchase({ id: "older-1", userId: "user-9", createdAt: new Date("2026-04-01T00:00:00.000Z") });
  const service = createService({ purchases: [older, target] });

  const paged = await service.listPending({ page: 1, pageSize: 1 });
  assert.equal(paged.items.length, 1);

  const targeted = await service.evaluateByPurchaseId("target-1");
  assert.equal(targeted.item?.purchaseId, "target-1");
  assert.equal(targeted.item?.eligibilityStatus, "eligible");
  assert.equal(targeted.recoveryGroupKey, "user-9:adapt-1");
});

test("default filters return only eligible and non-ignored items", async () => {
  const eligible = buildPurchase({ id: "eligible-1" });
  const resolved = buildPurchase({
    id: "resolved-1",
    user: { id: "user-1", name: "User One", email: "user1@example.com", creditsRemaining: 2 },
  });
  const service = createService({
    purchases: [eligible, resolved],
    ignores: [
      {
        purchaseId: "eligible-1",
        ignoredAt: new Date("2026-05-01T12:00:00.000Z"),
        ignoredByAdminId: "admin-1",
      },
    ],
  });

  const result = await service.listPending();
  assert.equal(result.total, 0);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 20);
});

test("ignored=true shows ignored grouped representative with metadata", async () => {
  const first = buildPurchase({ id: "p-1", createdAt: new Date("2026-05-01T10:00:00.000Z") });
  const second = buildPurchase({ id: "p-2", createdAt: new Date("2026-05-03T10:00:00.000Z") });
  const service = createService({
    purchases: [first, second],
    ignores: [
      {
        purchaseId: "p-1",
        ignoredAt: new Date("2026-05-03T12:00:00.000Z"),
        ignoredByAdminId: "admin-9",
      },
    ],
  });

  const result = await service.listPending({ ignored: "true", eligibilityStatus: "all" });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.purchaseId, "p-2");
  assert.equal(result.items[0]?.ignored, true);
  assert.equal(result.items[0]?.ignoredByAdminUserId, "admin-9");
  assert.equal(result.items[0]?.ignoredAt, "2026-05-03T12:00:00.000Z");
});
