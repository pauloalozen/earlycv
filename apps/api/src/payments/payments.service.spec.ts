import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

import { PaymentsService } from "./payments.service";

process.env.PAYMENT_CHECKOUT_MODE = "brick";
process.env.PAYMENT_BRICK_ENABLED = "true";
delete process.env.PAYMENT_BRICK_ALLOWED_USER_IDS;
delete process.env.PAYMENT_BRICK_ALLOWED_EMAILS;

test("getBrickCheckoutData returns checkout summary for valid pending purchase", async () => {
  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          currency: "BRL",
          status: "pending",
          planType: "starter",
          originAction: "buy_credits",
          originAdaptationId: null,
          user: { email: "user-1@earlycv.com.br" },
        }),
      },
      user: {
        findUnique: async () => ({ id: "user-1", email: "user-1@earlycv.com.br" }),
      },
    } as never,
    {} as never,
  );

  const result = await service.getBrickCheckoutData("user-1", "purchase-1");

  assert.deepEqual(result, {
    purchaseId: "purchase-1",
    amount: 11.9,
    currency: "BRL",
    description: "EarlyCV - pacote Starter",
    status: "pending",
    originAction: "buy_credits",
    originAdaptationId: null,
    payerEmail: "user-1@earlycv.com.br",
    checkoutMode: "brick",
  });
});

test("getBrickCheckoutData rejects unknown purchase", async () => {
  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => null,
      },
      user: {
        findUnique: async () => ({ id: "user-1", email: "user-1@earlycv.com.br" }),
      },
    } as never,
    {} as never,
  );

  await assert.rejects(
    () => service.getBrickCheckoutData("user-1", "missing"),
    NotFoundException,
  );
});

test("getBrickCheckoutData rejects purchase with non-pending status", async () => {
  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          currency: "BRL",
          status: "completed",
          planType: "starter",
          originAction: "buy_credits",
          originAdaptationId: null,
          user: { email: "user-1@earlycv.com.br" },
        }),
      },
      user: {
        findUnique: async () => ({ id: "user-1", email: "user-1@earlycv.com.br" }),
      },
    } as never,
    {} as never,
  );

  await assert.rejects(
    () => service.getBrickCheckoutData("user-1", "purchase-1"),
    ConflictException,
  );
});

test("getBrickCheckoutData rejects purchase with status none", async () => {
  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          currency: "BRL",
          status: "none",
          planType: "starter",
          originAction: "buy_credits",
          originAdaptationId: null,
          user: { email: "user-1@earlycv.com.br" },
        }),
      },
      user: {
        findUnique: async () => ({ id: "user-1", email: "user-1@earlycv.com.br" }),
      },
    } as never,
    {} as never,
  );

  await assert.rejects(
    () => service.getBrickCheckoutData("user-1", "purchase-1"),
    ConflictException,
  );
});

test("getBrickCheckoutData rejects invalid unlock_cv purchase without adaptation id", async () => {
  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          currency: "BRL",
          status: "pending",
          planType: "starter",
          originAction: "unlock_cv",
          originAdaptationId: null,
          user: { email: "user-1@earlycv.com.br" },
        }),
      },
      user: {
        findUnique: async () => ({ id: "user-1", email: "user-1@earlycv.com.br" }),
      },
    } as never,
    {} as never,
  );

  await assert.rejects(
    () => service.getBrickCheckoutData("user-1", "purchase-1"),
    ConflictException,
  );
});

test("getBrickCheckoutData rejects user outside allowlist", async () => {
  const originalMode = process.env.PAYMENT_CHECKOUT_MODE;
  const originalEnabled = process.env.PAYMENT_BRICK_ENABLED;
  const originalAllowedIds = process.env.PAYMENT_BRICK_ALLOWED_USER_IDS;

  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  process.env.PAYMENT_BRICK_ENABLED = "true";
  process.env.PAYMENT_BRICK_ALLOWED_USER_IDS = "other-user";

  const service = new PaymentsService(
    {
      planPurchase: { findFirst: async () => null },
      user: {
        findUnique: async () => ({ id: "user-1", email: "user-1@earlycv.com.br" }),
      },
    } as never,
    {} as never,
  );

  try {
    await assert.rejects(
      () => service.getBrickCheckoutData("user-1", "purchase-1"),
      ForbiddenException,
    );
  } finally {
    if (originalMode === undefined) delete process.env.PAYMENT_CHECKOUT_MODE;
    else process.env.PAYMENT_CHECKOUT_MODE = originalMode;
    if (originalEnabled === undefined) delete process.env.PAYMENT_BRICK_ENABLED;
    else process.env.PAYMENT_BRICK_ENABLED = originalEnabled;
    if (originalAllowedIds === undefined)
      delete process.env.PAYMENT_BRICK_ALLOWED_USER_IDS;
    else process.env.PAYMENT_BRICK_ALLOWED_USER_IDS = originalAllowedIds;
  }
});

test("submitBrickPayment validates dry-run without changing purchase status", async () => {
  const originalMode = process.env.PAYMENT_CHECKOUT_MODE;
  const originalEnabled = process.env.PAYMENT_BRICK_ENABLED;
  const originalDryRun = process.env.PAYMENT_BRICK_DRY_RUN;
  const originalAllowedIds = process.env.PAYMENT_BRICK_ALLOWED_USER_IDS;

  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  process.env.PAYMENT_BRICK_ENABLED = "true";
  process.env.PAYMENT_BRICK_DRY_RUN = "true";
  process.env.PAYMENT_BRICK_ALLOWED_USER_IDS = "user-1";

  let updateCalled = false;
  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          status: "pending",
          originAction: "buy_credits",
          originAdaptationId: null,
        }),
        update: async () => {
          updateCalled = true;
          return { ok: true };
        },
      },
      user: {
        findUnique: async () => ({ id: "user-1", email: "user-1@earlycv.com.br" }),
      },
    } as never,
    {} as never,
  );

  try {
    const result = await service.submitBrickPayment("user-1", "purchase-1", {
      token: "secret",
      transaction_amount: 999,
    });

    assert.deepEqual(result, {
      dryRun: true,
      purchaseId: "purchase-1",
      status: "validated",
      checkoutMode: "brick",
      message: "Brick payload validated. No Mercado Pago payment was created.",
    });
    assert.equal(updateCalled, false);
  } finally {
    if (originalMode === undefined) delete process.env.PAYMENT_CHECKOUT_MODE;
    else process.env.PAYMENT_CHECKOUT_MODE = originalMode;
    if (originalEnabled === undefined) delete process.env.PAYMENT_BRICK_ENABLED;
    else process.env.PAYMENT_BRICK_ENABLED = originalEnabled;
    if (originalDryRun === undefined) delete process.env.PAYMENT_BRICK_DRY_RUN;
    else process.env.PAYMENT_BRICK_DRY_RUN = originalDryRun;
    if (originalAllowedIds === undefined)
      delete process.env.PAYMENT_BRICK_ALLOWED_USER_IDS;
    else process.env.PAYMENT_BRICK_ALLOWED_USER_IDS = originalAllowedIds;
  }
});

test("submitBrickPayment rejects user outside allowlist", async () => {
  const originalMode = process.env.PAYMENT_CHECKOUT_MODE;
  const originalEnabled = process.env.PAYMENT_BRICK_ENABLED;
  const originalDryRun = process.env.PAYMENT_BRICK_DRY_RUN;
  const originalAllowedIds = process.env.PAYMENT_BRICK_ALLOWED_USER_IDS;

  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  process.env.PAYMENT_BRICK_ENABLED = "true";
  process.env.PAYMENT_BRICK_DRY_RUN = "true";
  process.env.PAYMENT_BRICK_ALLOWED_USER_IDS = "user-2";

  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          status: "pending",
          originAction: "buy_credits",
          originAdaptationId: null,
        }),
      },
      user: {
        findUnique: async () => ({ id: "user-1", email: "user-1@earlycv.com.br" }),
      },
    } as never,
    {} as never,
  );

  try {
    await assert.rejects(
      () => service.submitBrickPayment("user-1", "purchase-1", { token: "x" }),
      ForbiddenException,
    );
  } finally {
    if (originalMode === undefined) delete process.env.PAYMENT_CHECKOUT_MODE;
    else process.env.PAYMENT_CHECKOUT_MODE = originalMode;
    if (originalEnabled === undefined) delete process.env.PAYMENT_BRICK_ENABLED;
    else process.env.PAYMENT_BRICK_ENABLED = originalEnabled;
    if (originalDryRun === undefined) delete process.env.PAYMENT_BRICK_DRY_RUN;
    else process.env.PAYMENT_BRICK_DRY_RUN = originalDryRun;
    if (originalAllowedIds === undefined)
      delete process.env.PAYMENT_BRICK_ALLOWED_USER_IDS;
    else process.env.PAYMENT_BRICK_ALLOWED_USER_IDS = originalAllowedIds;
  }
});
