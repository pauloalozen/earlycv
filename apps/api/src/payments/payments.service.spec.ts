import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Payment } from "mercadopago";

import { PaymentsService } from "./payments.service";

process.env.PAYMENT_CHECKOUT_MODE = "brick";

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
    unitsIncluded: 3,
    unitPrice: 11.9 / 3,
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

test("getBrickCheckoutData rejects when mode is pro", async () => {
  const originalMode = process.env.PAYMENT_CHECKOUT_MODE;

  process.env.PAYMENT_CHECKOUT_MODE = "pro";

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
  }
});

test("submitBrickPayment returns approved redirect when provider approves", async () => {
  const originalMode = process.env.PAYMENT_CHECKOUT_MODE;
  const originalCreate = Payment.prototype.create;

  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  Payment.prototype.create = async () => ({ id: 101, status: "approved" }) as never;

  let updateCalled = false;
  let applyCalled = false;
  let updateData: Record<string, unknown> | null = null;

  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          paymentReference: "pref-1",
          planType: "starter",
          status: "pending",
          mpPaymentId: null,
          originAction: "buy_credits",
          originAdaptationId: null,
        }),
        updateMany: async () => ({ count: 1 }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updateCalled = true;
          updateData = data;
          return { ok: true };
        },
      },
      paymentAuditLog: { create: async () => ({ ok: true }) },
    } as never,
    {
      applyApprovedPurchase: async () => {
        applyCalled = true;
        return true;
      },
    } as never,
  );

  try {
    const result = await service.submitBrickPayment("user-1", "purchase-1", {
      token: "secret",
      payment_method_id: "visa",
      installments: 1,
      transaction_amount: 999,
    });

    assert.deepEqual(result, {
      purchaseId: "purchase-1",
      status: "approved",
      checkoutMode: "brick",
      redirectTo: "/pagamento/concluido?checkoutId=purchase-1",
      qrCodeBase64: null,
      qrCodeText: null,
    });
    assert.equal(updateCalled, true);
    assert.equal("status" in (updateData ?? {}), false);
    assert.equal(applyCalled, true);
  } finally {
    Payment.prototype.create = originalCreate;
    if (originalMode === undefined) delete process.env.PAYMENT_CHECKOUT_MODE;
    else process.env.PAYMENT_CHECKOUT_MODE = originalMode;
  }
});

test("submitBrickPayment rejects when mode is pro", async () => {
  const originalMode = process.env.PAYMENT_CHECKOUT_MODE;

  process.env.PAYMENT_CHECKOUT_MODE = "pro";

  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          paymentReference: "pref-1",
          planType: "starter",
          status: "pending",
          mpPaymentId: null,
          originAction: "buy_credits",
          originAdaptationId: null,
        }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ ok: true }),
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
  }
});

test("submitBrickPayment blocks concurrent submit when lock is not acquired", async () => {
  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  const originalCreate = Payment.prototype.create;
  Payment.prototype.create = async () => ({ id: 202, status: "pending" }) as never;

  let updateManyCalls = 0;

  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          paymentReference: "pref-1",
          planType: "starter",
          status: "pending",
          mpPaymentId: null,
          originAction: "buy_credits",
          originAdaptationId: null,
        }),
        updateMany: async () => {
          updateManyCalls += 1;
          return { count: updateManyCalls === 1 ? 1 : 0 };
        },
        update: async () => ({ ok: true }),
      },
      paymentAuditLog: { create: async () => ({ ok: true }) },
    } as never,
    {} as never,
  );

  const payload = { token: "tok_123", payment_method_id: "visa", installments: 1 };
  const first = service.submitBrickPayment("user-1", "purchase-1", payload);
  const second = service.submitBrickPayment("user-1", "purchase-1", payload);

  const [firstResult, secondResult] = await Promise.allSettled([first, second]);

  assert.equal(firstResult.status, "fulfilled");
  assert.equal(secondResult.status, "rejected");
  if (secondResult.status === "rejected") {
    assert.equal(secondResult.reason instanceof ConflictException, true);
  }

  Payment.prototype.create = originalCreate;
});

test("submitBrickPayment accepts pix payload with payer email", async () => {
  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  const originalCreate = Payment.prototype.create;
  Payment.prototype.create = async () =>
    ({
      id: 303,
      status: "pending",
      point_of_interaction: {
        transaction_data: {
          qr_code_base64: "data:image/png;base64,abc",
          qr_code: "000201010212...",
        },
      },
    }) as never;

  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          paymentReference: "pref-1",
          planType: "starter",
          status: "pending",
          mpPaymentId: null,
          originAction: "buy_credits",
          originAdaptationId: null,
        }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ ok: true }),
      },
      paymentAuditLog: { create: async () => ({ ok: true }) },
    } as never,
    {} as never,
  );

  const result = await service.submitBrickPayment("user-1", "purchase-1", {
    payment_method_id: "pix",
    payer: { email: "pix@example.com" },
  });

  assert.equal(result.status, "pending");
  assert.equal(result.qrCodeBase64, "data:image/png;base64,abc");
  assert.equal(result.qrCodeText, "000201010212...");
  Payment.prototype.create = originalCreate;
});

test("submitBrickPayment returns safe rejected error when provider rejects", async () => {
  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  const originalCreate = Payment.prototype.create;
  Payment.prototype.create = async () => ({ id: 404, status: "rejected" }) as never;

  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          paymentReference: "pref-1",
          planType: "starter",
          status: "pending",
          mpPaymentId: null,
          originAction: "buy_credits",
          originAdaptationId: null,
        }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ ok: true }),
      },
      paymentAuditLog: { create: async () => ({ ok: true }) },
    } as never,
    {} as never,
  );

  await assert.rejects(async () => {
    try {
      await service.submitBrickPayment("user-1", "purchase-1", {
        token: "tok_123",
        payment_method_id: "visa",
        installments: 1,
      });
      assert.fail("Expected submitBrickPayment to throw");
    } catch (error) {
      assert.equal(error instanceof BadRequestException, true);
      const response = (error as BadRequestException).getResponse() as {
        errorCode?: string;
      };
      assert.equal(response.errorCode, "brick_payment_rejected");
      throw error;
    }
  }, BadRequestException);
  Payment.prototype.create = originalCreate;
});

test("submitBrickPayment rejects boleto payload", async () => {
  process.env.PAYMENT_CHECKOUT_MODE = "brick";

  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          paymentReference: "pref-1",
          planType: "starter",
          status: "pending",
          mpPaymentId: null,
          originAction: "buy_credits",
          originAdaptationId: null,
        }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ ok: true }),
      },
    } as never,
    {} as never,
  );

  await assert.rejects(
    () =>
      service.submitBrickPayment("user-1", "purchase-1", {
        payment_method_id: "bolbradesco",
      }),
    BadRequestException,
  );
});

test("submitBrickPayment rejects non-pix without token", async () => {
  process.env.PAYMENT_CHECKOUT_MODE = "brick";

  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          paymentReference: "pref-1",
          planType: "starter",
          status: "pending",
          mpPaymentId: null,
          originAction: "buy_credits",
          originAdaptationId: null,
        }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ ok: true }),
      },
    } as never,
    {} as never,
  );

  await assert.rejects(
    () =>
      service.submitBrickPayment("user-1", "purchase-1", {
        payment_method_id: "visa",
        installments: 1,
      }),
    BadRequestException,
  );
});

test("submitBrickPayment uses purchase user email as fallback for card payer", async () => {
  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  const originalCreate = Payment.prototype.create;
  let capturedBody: Record<string, unknown> | null = null;
  Payment.prototype.create = async (input: { body: Record<string, unknown> }) => {
    capturedBody = input.body;
    return { id: 606, status: "pending" } as never;
  };

  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          paymentReference: "pref-1",
          planType: "starter",
          status: "pending",
          mpPaymentId: null,
          originAction: "buy_credits",
          originAdaptationId: null,
          user: { email: "fallback-user@example.com" },
        }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ ok: true }),
      },
      paymentAuditLog: { create: async () => ({ ok: true }) },
    } as never,
    {} as never,
  );

  const result = await service.submitBrickPayment("user-1", "purchase-1", {
    payment_method_id: "visa",
    token: "tok_123",
    installments: 1,
  });

  assert.equal(result.status, "pending");
  const payer = (capturedBody?.payer ?? {}) as { email?: string };
  assert.equal(payer.email, "fallback-user@example.com");

  Payment.prototype.create = originalCreate;
});

test("submitBrickPayment exposes provider detail in dev when provider throws unknown error", async () => {
  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const originalCreate = Payment.prototype.create;
  Payment.prototype.create = async () => {
    throw new Error("mp_provider_timeout");
  };

  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          paymentReference: "pref-1",
          planType: "starter",
          status: "pending",
          mpPaymentId: null,
          originAction: "buy_credits",
          originAdaptationId: null,
        }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ ok: true }),
      },
      paymentAuditLog: { create: async () => ({ ok: true }) },
    } as never,
    {} as never,
  );

  await assert.rejects(async () => {
    try {
      await service.submitBrickPayment("user-1", "purchase-1", {
        payment_method_id: "pix",
        payer: { email: "pix@example.com" },
      });
      assert.fail("Expected submitBrickPayment to throw");
    } catch (error) {
      assert.equal(error instanceof BadRequestException, true);
      const response = (error as BadRequestException).getResponse() as {
        errorCode?: string;
        message?: string;
      };
      assert.equal(response.errorCode, "brick_payment_provider_error");
      assert.equal(response.message?.includes("mp_provider_timeout"), true);
      throw error;
    } finally {
      Payment.prototype.create = originalCreate;
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  }, BadRequestException);
});

test("submitBrickPayment rejects invalid notification URL before provider call", async () => {
  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  const originalApiUrl = process.env.API_URL;
  process.env.API_URL = "localhost:4000";
  const originalCreate = Payment.prototype.create;
  let called = false;
  Payment.prototype.create = async () => {
    called = true;
    return { id: 303, status: "pending" } as never;
  };

  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          paymentReference: "pref-1",
          planType: "starter",
          status: "pending",
          mpPaymentId: null,
          originAction: "buy_credits",
          originAdaptationId: null,
        }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ ok: true }),
      },
      paymentAuditLog: { create: async () => ({ ok: true }) },
    } as never,
    {} as never,
  );

  await assert.rejects(async () => {
    try {
      await service.submitBrickPayment("user-1", "purchase-1", {
        payment_method_id: "pix",
        payer: { email: "pix@example.com" },
      });
      assert.fail("Expected submitBrickPayment to throw");
    } catch (error) {
      assert.equal(error instanceof BadRequestException, true);
      const response = (error as BadRequestException).getResponse() as {
        errorCode?: string;
      };
      assert.equal(response.errorCode, "brick_notification_url_invalid");
      assert.equal(called, false);
      throw error;
    } finally {
      Payment.prototype.create = originalCreate;
      if (originalApiUrl === undefined) delete process.env.API_URL;
      else process.env.API_URL = originalApiUrl;
    }
  }, BadRequestException);
});

test("submitBrickPayment provider error does not leak sensitive nested payload", async () => {
  const originalMode = process.env.PAYMENT_CHECKOUT_MODE;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCreate = Payment.prototype.create;

  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  process.env.NODE_ENV = "development";
  Payment.prototype.create = async () => {
    throw {
      name: "ProviderError",
      message: "provider failed",
      code: "MP-500",
      response: {
        status: 500,
        data: {
          access_token: "super-secret-token",
          payer: { email: "private@example.com" },
        },
        headers: {
          authorization: "Bearer leaked",
          cookie: "session=secret",
        },
      },
      request: {
        headers: {
          authorization: "Bearer leaked2",
        },
      },
      config: {
        headers: {
          Authorization: "Bearer leaked3",
        },
      },
    };
  };

  const service = new PaymentsService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-1",
          amountInCents: 1190,
          paymentReference: "pref-1",
          planType: "starter",
          status: "pending",
          mpPaymentId: null,
          originAction: "buy_credits",
          originAdaptationId: null,
          user: { email: "payer@earlycv.com.br" },
        }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ ok: true }),
      },
      paymentAuditLog: { create: async () => ({ ok: true }) },
    } as never,
    {} as never,
  );

  try {
    await assert.rejects(
      () =>
        service.submitBrickPayment("user-1", "purchase-1", {
          token: "tok_test",
          payment_method_id: "visa",
          installments: 1,
        }),
      (error: unknown) => {
        assert.equal(error instanceof BadRequestException, true);
        const response =
          error instanceof BadRequestException ? error.getResponse() : null;
        const message =
          response && typeof response === "object" && "message" in response
            ? String((response as { message: unknown }).message)
            : "";

        assert.equal(message.includes("authorization"), false);
        assert.equal(message.includes("cookie"), false);
        assert.equal(message.includes("access_token"), false);
        assert.equal(message.includes("private@example.com"), false);

        return true;
      },
    );
  } finally {
    Payment.prototype.create = originalCreate;
    if (originalMode === undefined) delete process.env.PAYMENT_CHECKOUT_MODE;
    else process.env.PAYMENT_CHECKOUT_MODE = originalMode;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("brick client token prefers MERCADOPAGO_BRICK_ACCESS_TOKEN over legacy token", () => {
  const originalBrickToken = process.env.MERCADOPAGO_BRICK_ACCESS_TOKEN;
  const originalLegacyToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  process.env.MERCADOPAGO_BRICK_ACCESS_TOKEN = "brick-token";
  process.env.MERCADOPAGO_ACCESS_TOKEN = "legacy-token";

  const service = new PaymentsService({} as never, {} as never);

  const token = (
    service as unknown as { getBrickAccessToken: () => string | null }
  ).getBrickAccessToken();
  assert.equal(token, "brick-token");

  if (originalBrickToken === undefined) delete process.env.MERCADOPAGO_BRICK_ACCESS_TOKEN;
  else process.env.MERCADOPAGO_BRICK_ACCESS_TOKEN = originalBrickToken;
  if (originalLegacyToken === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  else process.env.MERCADOPAGO_ACCESS_TOKEN = originalLegacyToken;
});
