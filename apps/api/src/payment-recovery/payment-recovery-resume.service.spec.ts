import assert from "node:assert/strict";
import { test } from "node:test";

import { NotFoundException } from "@nestjs/common";
import { PaymentRecoveryResumeService } from "./payment-recovery-resume.service";

test("bridge service delegates to plans resume checkout", async () => {
  let delegated: { userId: string; purchaseId: string } | null = null;
  const service = new PaymentRecoveryResumeService(
    {
      paymentRecoveryToken: {
        findUnique: async () => ({
          id: "tok-1",
          purchaseId: "purchase-1",
          userId: "user-1",
          adaptationId: "adapt-1",
          recoveryGroupKey: "g1",
          emailRecordId: "email-1",
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
      planPurchase: {
        findUnique: async () => ({
          id: "purchase-1",
          userId: "user-1",
          status: "pending",
          originAction: "unlock_cv",
          originAdaptationId: "adapt-1",
        }),
      },
    } as any,
    {
      resumeCheckout: async (userId: string, purchaseId: string) => {
        delegated = { userId, purchaseId };
        return { checkoutUrl: "https://checkout.example/path" };
      },
    } as any,
    { emit: () => undefined } as any,
  );

  const result = await service.resumeCheckoutForToken({
    token: "a".repeat(64),
    currentUserId: "user-1",
  });

  assert.equal(result.checkoutUrl, "https://checkout.example/path");
  assert.deepEqual(delegated, { userId: "user-1", purchaseId: "purchase-1" });
});

test("bridge service rejects ownership mismatch", async () => {
  const service = new PaymentRecoveryResumeService(
    {
      paymentRecoveryToken: {
        findUnique: async () => ({
          id: "tok-1",
          purchaseId: "purchase-1",
          userId: "user-1",
          adaptationId: "adapt-1",
          recoveryGroupKey: "g1",
          emailRecordId: "email-1",
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
      planPurchase: {
        findUnique: async () => ({
          id: "purchase-1",
          userId: "user-2",
          status: "pending",
          originAction: "unlock_cv",
          originAdaptationId: "adapt-1",
        }),
      },
    } as any,
    { resumeCheckout: async () => ({ checkoutUrl: "https://checkout.example/path" }) } as any,
    { emit: () => undefined } as any,
  );

  await assert.rejects(
    async () => {
      await service.resumeCheckoutForToken({ token: "a".repeat(64), currentUserId: "user-1" });
    },
    NotFoundException,
  );
});
