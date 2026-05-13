import assert from "node:assert/strict";
import { test } from "node:test";
import { Preference } from "mercadopago";
import { PlansService } from "./plans.service";

test("records enriched payment_failed with purchase_not_found when webhook resolution marks failed", async () => {
  const recordedEvents: Array<{
    eventName: string;
    source: string;
    metadata: Record<string, unknown>;
  }> = [];
  let findUniqueCalls = 0;

  const service = new PlansService(
    {
      paymentAuditLog: {
        create: async () => ({ id: "audit-1" }),
      },
      planPurchase: {
        findFirst: async () => null,
        findUnique: async () => {
          findUniqueCalls += 1;
          return null;
        },
        update: async () => {
          throw new Error("should not update purchase for failed status");
        },
      },
      user: {
        update: async () => {
          throw new Error("should not update user for failed status");
        },
      },
    } as never,
    {
      record: async (
        input: { eventName: string; metadata?: Record<string, unknown> },
        _context: unknown,
        source: string,
      ) => {
        recordedEvents.push({
          eventName: input.eventName,
          metadata: input.metadata ?? {},
          source,
        });
        return {
          event: { id: "evt-1" },
          ingested: true,
        };
      },
    } as never,
  );

  (
    service as {
      resolveMercadoPagoPayment: (body: unknown) => Promise<unknown>;
    }
  ).resolveMercadoPagoPayment = async () => ({
    merchantOrderId: "ord-1",
    paymentId: "mp-1",
    paymentReference: "pay-ref-1",
    preferenceId: "pref-1",
    rawStatus: "rejected",
    status: "failed",
  });

  await service.handleWebhook("mercadopago", {
    data: { id: "mp-1" },
    type: "payment",
  });

  assert.equal(findUniqueCalls, 2);
  assert.equal(recordedEvents.length, 1);
  assert.equal(recordedEvents[0]?.eventName, "payment_failed");
  assert.equal(recordedEvents[0]?.source, "backend");
  assert.equal(recordedEvents[0]?.metadata.purchaseResolved, false);
  assert.equal(
    recordedEvents[0]?.metadata.enrichmentStatus,
    "purchase_not_found",
  );
  assert.equal(recordedEvents[0]?.metadata.paymentReference, "pay-ref-1");
  assert.equal(recordedEvents[0]?.metadata.paymentId, "mp-1");
  assert.equal(recordedEvents[0]?.metadata.preferenceId, "pref-1");
  assert.equal(recordedEvents[0]?.metadata.merchantOrderId, "ord-1");
  assert.equal(recordedEvents[0]?.metadata.distinct_id, "pay-ref-1");
});

test("marks purchase as failed before recording enriched payment_failed", async () => {
  const updatedStatuses: string[] = [];
  const recordedEvents: Array<Record<string, unknown>> = [];

  const service = new PlansService(
    {
      paymentAuditLog: {
        create: async () => ({ id: "audit-2" }),
      },
      planPurchase: {
        findFirst: async () => null,
        findUnique: async () => ({
          amountInCents: 2990,
          analysisCreditsGranted: 9,
          creditsGranted: 3,
          currency: "BRL",
          id: "purchase-failed-1",
          originAction: "unlock_cv",
          originAdaptationId: "adapt-1",
          paymentProvider: "mercadopago",
          planType: "pro",
          status: "pending",
          userId: "user-123",
        }),
        update: async ({ data }: { data: { status: string } }) => {
          updatedStatuses.push(data.status);
          return { ok: true };
        },
      },
      user: {
        update: async () => ({ ok: true }),
      },
    } as never,
    {
      record: async (input: {
        eventName: string;
        metadata?: Record<string, unknown>;
      }) => {
        recordedEvents.push({
          eventName: input.eventName,
          ...(input.metadata ?? {}),
        });
        return {
          event: { id: "evt-failed-1" },
          ingested: true,
        };
      },
    } as never,
  );

  (
    service as {
      resolveMercadoPagoPayment: (body: unknown) => Promise<unknown>;
    }
  ).resolveMercadoPagoPayment = async () => ({
    merchantOrderId: "ord-failed-1",
    paymentId: "mp-failed-1",
    paymentReference: "pay-ref-failed-1",
    preferenceId: "pref-failed-1",
    rawStatus: "rejected",
    status: "failed",
  });

  await service.handleWebhook("mercadopago", {
    data: { id: "mp-failed-1" },
    type: "payment",
  });

  assert.deepEqual(updatedStatuses, ["failed"]);
  assert.equal(recordedEvents.length, 1);
  assert.equal(recordedEvents[0]?.eventName, "payment_failed");
  assert.equal(recordedEvents[0]?.purchaseResolved, true);
  assert.equal(recordedEvents[0]?.enrichmentStatus, "enriched_from_purchase");
  assert.equal(recordedEvents[0]?.purchaseId, "purchase-failed-1");
  assert.equal(recordedEvents[0]?.userId, "user-123");
  assert.equal(recordedEvents[0]?.user_id, "user-123");
  assert.equal(recordedEvents[0]?.planId, "pro");
  assert.equal(recordedEvents[0]?.planName, "Pro");
  assert.equal(recordedEvents[0]?.amount, 2990);
  assert.equal(recordedEvents[0]?.credits, 3);
  assert.equal(recordedEvents[0]?.provider, "mercadopago");
  assert.equal(recordedEvents[0]?.paymentStatus, "failed");
  assert.equal(recordedEvents[0]?.statusDetail, "rejected");
  assert.equal(recordedEvents[0]?.originAction, "unlock_cv");
  assert.equal(recordedEvents[0]?.originAdaptationId, "adapt-1");
  assert.equal(recordedEvents[0]?.distinct_id, "user-123");
});

test("does not record payment_failed when webhook resolution is approved", async () => {
  const recordedEvents: string[] = [];

  const service = new PlansService(
    {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          planPurchase: {
            findUnique: async () => ({
              analysisCreditsGranted: 9,
              creditsGranted: 3,
              id: "purchase-1",
              paymentReference: "pay-ref-2",
              planType: "pro",
              status: "pending",
              userId: "user-1",
            }),
            update: async () => ({ ok: true }),
          },
          user: {
            update: async () => ({ ok: true }),
          },
        }),
      paymentAuditLog: {
        create: async () => ({ id: "audit-3" }),
      },
      planPurchase: {
        findUnique: async () => ({
          analysisCreditsGranted: 9,
          creditsGranted: 3,
          id: "purchase-1",
          paymentReference: "pay-ref-2",
          planType: "pro",
          status: "pending",
          userId: "user-1",
        }),
        update: async () => ({ ok: true }),
      },
      user: {
        update: async () => ({ ok: true }),
      },
    } as never,
    {
      record: async (input: { eventName: string }) => {
        recordedEvents.push(input.eventName);
        return {
          event: { id: "evt-2" },
          ingested: true,
        };
      },
    } as never,
  );

  (
    service as {
      resolveMercadoPagoPayment: (body: unknown) => Promise<unknown>;
    }
  ).resolveMercadoPagoPayment = async () => ({
    paymentReference: "pay-ref-2",
    status: "approved",
  });

  await service.handleWebhook("mercadopago", {
    data: { id: "mp-2" },
    type: "payment",
  });

  assert.equal(recordedEvents.includes("payment_failed"), false);
});

test("handleWebhook stores sanitized audit rawPayload", async () => {
  const auditRows: Array<Record<string, unknown>> = [];

  const service = new PlansService(
    {
      paymentAuditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          auditRows.push(data);
          return { id: "audit-sanitized-1" };
        },
      },
      planPurchase: {
        findFirst: async () => null,
      },
    } as never,
    {
      record: async () => ({ event: { id: "evt" }, ingested: true }),
    } as never,
  );

  (
    service as {
      resolveMercadoPagoPayment: (body: unknown) => Promise<unknown>;
    }
  ).resolveMercadoPagoPayment = async () => ({
    paymentReference: null,
    paymentId: "mp-123",
    rawStatus: "pending",
    status: "pending",
  });

  await service.handleWebhook("mercadopago", {
    id: "evt-123",
    type: "payment",
    action: "payment.updated",
    data: { id: "mp-123", token: "secret-token" },
    payer: {
      email: "private@example.com",
      identification: { number: "12345678900" },
    },
    headers: { authorization: "Bearer test-token", cookie: "a=b" },
    nested: { response: { headers: { authorization: "Bearer nested-token" } } },
  });

  assert.equal(auditRows.length > 0, true);
  const rawPayload = auditRows[0]?.rawPayload as Record<string, unknown>;
  assert.equal(typeof rawPayload, "object");
  assert.equal(rawPayload.id, "evt-123");
  assert.equal(rawPayload.type, "payment");
  assert.equal(rawPayload.action, "payment.updated");
  assert.deepEqual(rawPayload.data, { id: "mp-123" });
  assert.equal("payer" in rawPayload, false);
  assert.equal("headers" in rawPayload, false);
  assert.equal("nested" in rawPayload, false);
});

test("resumeCheckout recreates MP checkout for pending purchase owned by user", async () => {
  const service = new PlansService(
    {
      planPurchase: {
        findUnique: async () => ({
          id: "purchase-1",
          userId: "user-1",
          planType: "pro",
          amountInCents: 2990,
          creditsGranted: 3,
          analysisCreditsGranted: 9,
          paymentReference: "pay-ref-1",
          status: "pending",
        }),
      },
      user: {
        findUnique: async () => ({
          email: "user-1@earlycv.com.br",
          name: "User One",
        }),
      },
    } as never,
    {
      record: async () => ({ event: { id: "evt-1" }, ingested: true }),
    } as never,
  );

  (
    service as {
      createMercadoPagoPreference: (
        purchaseId: string,
        paymentReference: string,
        plan: {
          label: string;
          amountInCents: number;
          downloadCreditsGranted: number;
          analysisCreditsGranted: number;
        },
        payer?: {
          email: string;
          name?: string;
        },
      ) => Promise<string>;
    }
  ).createMercadoPagoPreference = async (
    purchaseId,
    paymentReference,
    plan,
    payer,
  ) => {
    assert.equal(purchaseId, "purchase-1");
    assert.equal(paymentReference, "pay-ref-1");
    assert.equal(plan.amountInCents, 2990);
    assert.equal(plan.downloadCreditsGranted, 3);
    assert.equal(plan.analysisCreditsGranted, 9);
    assert.deepEqual(payer, {
      email: "user-1@earlycv.com.br",
      name: "User One",
    });
    return "https://mp.test/checkout/new";
  };

  const result = await service.resumeCheckout("user-1", "purchase-1");

  assert.deepEqual(result, { checkoutUrl: "https://mp.test/checkout/new" });
});

test("resumeCheckout rejects purchase from another user", async () => {
  const service = new PlansService(
    {
      planPurchase: {
        findUnique: async () => ({
          id: "purchase-1",
          userId: "user-2",
          planType: "pro",
          amountInCents: 2990,
          creditsGranted: 3,
          analysisCreditsGranted: 9,
          paymentReference: "pay-ref-1",
          status: "pending",
        }),
      },
      user: {
        findUnique: async () => ({
          email: "user-1@earlycv.com.br",
          name: "User One",
        }),
      },
    } as never,
    {
      record: async () => ({ event: { id: "evt-2" }, ingested: true }),
    } as never,
  );

  await assert.rejects(
    () => service.resumeCheckout("user-1", "purchase-1"),
    /Compra nao encontrada/,
  );
});

test("resumeCheckout rejects non-pending purchase", async () => {
  const service = new PlansService(
    {
      planPurchase: {
        findUnique: async () => ({
          id: "purchase-1",
          userId: "user-1",
          planType: "pro",
          amountInCents: 2990,
          creditsGranted: 3,
          analysisCreditsGranted: 9,
          paymentReference: "pay-ref-1",
          status: "completed",
        }),
      },
      user: {
        findUnique: async () => ({
          email: "user-1@earlycv.com.br",
          name: "User One",
        }),
      },
    } as never,
    {
      record: async () => ({ event: { id: "evt-3" }, ingested: true }),
    } as never,
  );

  await assert.rejects(
    () => service.resumeCheckout("user-1", "purchase-1"),
    /Compra nao pode ser retomada/,
  );
});

test("resumeCheckout keeps working when user email is invalid", async () => {
  const service = new PlansService(
    {
      planPurchase: {
        findUnique: async () => ({
          id: "purchase-1",
          userId: "user-1",
          planType: "pro",
          amountInCents: 2990,
          creditsGranted: 3,
          analysisCreditsGranted: 9,
          paymentReference: "pay-ref-1",
          status: "pending",
        }),
      },
      user: {
        findUnique: async () => ({
          email: "invalid-email",
          name: "User One",
        }),
      },
    } as never,
    {
      record: async () => ({ event: { id: "evt-4" }, ingested: true }),
    } as never,
  );

  (
    service as {
      createMercadoPagoPreference: (
        purchaseId: string,
        paymentReference: string,
        plan: {
          label: string;
          amountInCents: number;
          downloadCreditsGranted: number;
          analysisCreditsGranted: number;
        },
        payer?: {
          email: string;
          name?: string;
        },
      ) => Promise<string>;
    }
  ).createMercadoPagoPreference = async (
    purchaseId,
    paymentReference,
    plan,
    payer,
  ) => {
    assert.equal(purchaseId, "purchase-1");
    assert.equal(paymentReference, "pay-ref-1");
    assert.equal(plan.amountInCents, 2990);
    assert.equal(payer, undefined);
    return "https://mp.test/checkout/new";
  };

  const result = await service.resumeCheckout("user-1", "purchase-1");

  assert.deepEqual(result, { checkoutUrl: "https://mp.test/checkout/new" });
});

test("createCheckout with adaptationId reuses only unlock_cv purchase", async () => {
  let receivedWhere: Record<string, unknown> | null = null;
  const service = new PlansService(
    {
      cvAdaptation: {
        findUnique: async () => ({
          userId: "user-1",
          isUnlocked: false,
          adaptedContentJson: { ok: true },
        }),
      },
      planPurchase: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          receivedWhere = where;
          return null;
        },
        create: async () => ({
          id: "purchase-1",
          paymentReference: "pay-ref-1",
        }),
      },
      user: {
        findUnique: async () => ({ email: "a@b.com", name: "User" }),
      },
    } as never,
    {
      record: async () => ({ event: { id: "evt-5" }, ingested: true }),
    } as never,
  );

  (
    service as {
      createMercadoPagoPreference: (
        purchaseId: string,
        paymentReference: string,
        plan: { label: string; amountInCents: number },
      ) => Promise<string>;
    }
  ).createMercadoPagoPreference = async () => "https://mp.test/checkout/new";

  await service.createCheckout(
    "user-1",
    "starter",
    "00000000-0000-0000-0000-000000000001",
  );

  assert.equal(receivedWhere?.originAction, "unlock_cv");
  assert.equal(
    receivedWhere?.originAdaptationId,
    "00000000-0000-0000-0000-000000000001",
  );
});

test("createCheckout without adaptationId reuses only buy_credits purchase", async () => {
  let receivedWhere: Record<string, unknown> | null = null;
  const service = new PlansService(
    {
      planPurchase: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          receivedWhere = where;
          return null;
        },
        create: async () => ({
          id: "purchase-1",
          paymentReference: "pay-ref-1",
        }),
      },
      user: {
        findUnique: async () => ({ email: "a@b.com", name: "User" }),
      },
    } as never,
    {
      record: async () => ({ event: { id: "evt-6" }, ingested: true }),
    } as never,
  );

  (
    service as {
      createMercadoPagoPreference: (
        purchaseId: string,
        paymentReference: string,
        plan: { label: string; amountInCents: number },
      ) => Promise<string>;
    }
  ).createMercadoPagoPreference = async () => "https://mp.test/checkout/new";

  await service.createCheckout("user-1", "starter");

  assert.equal(receivedWhere?.originAction, "buy_credits");
  assert.equal(receivedWhere?.originAdaptationId, null);
});

test("createMercadoPagoPreference uses shared return config and preserves checkoutId query", async () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalApiUrl = process.env.API_URL;
  process.env.FRONTEND_URL = "https://earlycv.com.br";
  process.env.API_URL = "https://api.earlycv.com.br";

  let preferenceBody: Record<string, unknown> | null = null;
  const originalCreate = Preference.prototype.create;
  Preference.prototype.create = async ({
    body,
  }: {
    body: Record<string, unknown>;
  }) => {
    preferenceBody = body;
    return {
      id: "pref-123",
      init_point: "https://mp.test/checkout/123",
      sandbox_init_point: "https://sandbox.mp.test/checkout/123",
    } as never;
  };

  const service = new PlansService(
    {
      planPurchase: {
        update: async () => ({ ok: true }),
      },
    } as never,
    {
      record: async () => ({ event: { id: "evt-7" }, ingested: true }),
    } as never,
  );

  (
    service as {
      getMercadoPagoClient: () => unknown;
      isMpProduction: () => boolean;
    }
  ).getMercadoPagoClient = () => ({}) as never;
  (service as { isMpProduction: () => boolean }).isMpProduction = () => true;

  try {
    const checkoutUrl = await (
      service as {
        createMercadoPagoPreference: (
          purchaseId: string,
          paymentReference: string,
          plan: { label: string; amountInCents: number },
          payer?: { email: string; name?: string },
        ) => Promise<string>;
      }
    ).createMercadoPagoPreference(
      "purchase-https",
      "pay-ref-https",
      {
        label: "Plano Teste",
        amountInCents: 2990,
      },
      { email: "user@earlycv.com.br", name: "User" },
    );

    assert.equal(checkoutUrl, "https://mp.test/checkout/123");
    assert.ok(preferenceBody);
    assert.deepEqual(preferenceBody?.back_urls, {
      success:
        "https://earlycv.com.br/pagamento/concluido?checkoutId=purchase-https",
      failure:
        "https://earlycv.com.br/pagamento/falhou?checkoutId=purchase-https",
      pending:
        "https://earlycv.com.br/pagamento/pendente?checkoutId=purchase-https",
    });
    assert.equal(
      (preferenceBody?.items as Array<Record<string, unknown>> | undefined)?.[0]
        ?.category_id,
      "services",
    );
    assert.match(
      String(
        (
          preferenceBody?.items as Array<Record<string, unknown>> | undefined
        )?.[0]?.description,
      ),
      /EarlyCV|Plano/i,
    );
    assert.equal(preferenceBody?.auto_return, "approved");
  } finally {
    Preference.prototype.create = originalCreate;
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
    if (originalApiUrl === undefined) {
      delete process.env.API_URL;
    } else {
      process.env.API_URL = originalApiUrl;
    }
  }
});

test("createMercadoPagoPreference logs warning and skips auto_return on non-https", async () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalApiUrl = process.env.API_URL;
  process.env.FRONTEND_URL = "http://localhost:3000";
  process.env.API_URL = "http://localhost:4000";

  let preferenceBody: Record<string, unknown> | null = null;
  const warnings: string[] = [];
  const originalCreate = Preference.prototype.create;
  Preference.prototype.create = async ({
    body,
  }: {
    body: Record<string, unknown>;
  }) => {
    preferenceBody = body;
    return {
      id: "pref-456",
      sandbox_init_point: "https://sandbox.mp.test/checkout/456",
    } as never;
  };

  const service = new PlansService(
    {
      planPurchase: {
        update: async () => ({ ok: true }),
      },
    } as never,
    {
      record: async () => ({ event: { id: "evt-8" }, ingested: true }),
    } as never,
  );

  (
    service as {
      getMercadoPagoClient: () => unknown;
      isMpProduction: () => boolean;
      logger: { warn: (message: string) => void };
    }
  ).getMercadoPagoClient = () => ({}) as never;
  (service as { isMpProduction: () => boolean }).isMpProduction = () => false;
  (service as { logger: { warn: (message: string) => void } }).logger = {
    warn: (message: string) => warnings.push(message),
  } as never;

  try {
    const checkoutUrl = await (
      service as {
        createMercadoPagoPreference: (
          purchaseId: string,
          paymentReference: string,
          plan: { label: string; amountInCents: number },
        ) => Promise<string>;
      }
    ).createMercadoPagoPreference("purchase-http", "pay-ref-http", {
      label: "Plano Teste",
      amountInCents: 1190,
    });

    assert.equal(checkoutUrl, "https://sandbox.mp.test/checkout/456");
    assert.ok(preferenceBody);
    assert.deepEqual(preferenceBody?.back_urls, {
      success:
        "http://localhost:3000/pagamento/concluido?checkoutId=purchase-http",
      failure:
        "http://localhost:3000/pagamento/falhou?checkoutId=purchase-http",
      pending:
        "http://localhost:3000/pagamento/pendente?checkoutId=purchase-http",
    });
    assert.equal(
      (preferenceBody?.items as Array<Record<string, unknown>> | undefined)?.[0]
        ?.category_id,
      "services",
    );
    assert.match(
      String(
        (
          preferenceBody?.items as Array<Record<string, unknown>> | undefined
        )?.[0]?.description,
      ),
      /EarlyCV|Plano/i,
    );
    assert.equal(preferenceBody?.auto_return, undefined);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /flow=plan_purchase/);
    assert.match(warnings[0] ?? "", /purchaseId=purchase-http/);
    assert.match(warnings[0] ?? "", /frontendHost=localhost:3000/);
    assert.match(warnings[0] ?? "", /successUrlIsHttps=false/);
    assert.match(warnings[0] ?? "", /autoReturnEnabled=false/);
  } finally {
    Preference.prototype.create = originalCreate;
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
    if (originalApiUrl === undefined) {
      delete process.env.API_URL;
    } else {
      process.env.API_URL = originalApiUrl;
    }
  }
});

test("createCheckout returns internal Brick URL when mode is brick", async () => {
  const originalMode = process.env.PAYMENT_CHECKOUT_MODE;
  const originalFrontendUrl = process.env.FRONTEND_URL;

  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  process.env.PAYMENT_BRICK_ENABLED = "false";
  process.env.PAYMENT_BRICK_ALLOWED_USER_IDS = "blocked-user";
  process.env.PAYMENT_BRICK_ALLOWED_EMAILS = "blocked@example.com";
  process.env.FRONTEND_URL = "https://earlycv.com.br";

  const service = new PlansService(
    {
      planPurchase: {
        findFirst: async () => null,
        create: async () => ({
          id: "purchase-brick-1",
          paymentReference: "pay-ref-brick-1",
        }),
        update: async () => ({ ok: true }),
      },
      user: {
        findUnique: async () => ({
          email: "user-1@earlycv.com.br",
          name: "User One",
        }),
      },
    } as never,
    {
      record: async () => ({ event: { id: "evt-brick-1" }, ingested: true }),
    } as never,
  );

  (
    service as {
      createMercadoPagoPreference: () => Promise<string>;
    }
  ).createMercadoPagoPreference = async () => {
    throw new Error("checkout pro should not be called in brick mode");
  };

  try {
    const result = await service.createCheckout("user-1", "starter");
    assert.equal(
      result.checkoutUrl,
      "https://earlycv.com.br/pagamento/checkout/purchase-brick-1",
    );
  } finally {
    if (originalMode === undefined) delete process.env.PAYMENT_CHECKOUT_MODE;
    else process.env.PAYMENT_CHECKOUT_MODE = originalMode;
    delete process.env.PAYMENT_BRICK_ENABLED;
    delete process.env.PAYMENT_BRICK_ALLOWED_USER_IDS;
    delete process.env.PAYMENT_BRICK_ALLOWED_EMAILS;
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  }
});

test("createCheckout falls back to Checkout Pro when mode is pro", async () => {
  const originalMode = process.env.PAYMENT_CHECKOUT_MODE;

  process.env.PAYMENT_CHECKOUT_MODE = "pro";

  const service = new PlansService(
    {
      planPurchase: {
        findFirst: async () => null,
        create: async () => ({
          id: "purchase-pro-1",
          paymentReference: "pay-ref-pro-1",
        }),
      },
      user: {
        findUnique: async () => ({
          email: "blocked@earlycv.com.br",
          name: "Blocked User",
        }),
      },
    } as never,
    {
      record: async () => ({ event: { id: "evt-pro-1" }, ingested: true }),
    } as never,
  );

  (
    service as {
      createMercadoPagoPreference: () => Promise<string>;
    }
  ).createMercadoPagoPreference = async () => "https://mp.test/checkout/pro";

  try {
    const result = await service.createCheckout("user-999", "starter");
    assert.equal(result.checkoutUrl, "https://mp.test/checkout/pro");
  } finally {
    if (originalMode === undefined) delete process.env.PAYMENT_CHECKOUT_MODE;
    else process.env.PAYMENT_CHECKOUT_MODE = originalMode;
  }
});

test("getProAccessToken prefers MERCADOPAGO_PRO_ACCESS_TOKEN over legacy token", async () => {
  const originalProToken = process.env.MERCADOPAGO_PRO_ACCESS_TOKEN;
  const originalLegacyToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  process.env.MERCADOPAGO_PRO_ACCESS_TOKEN = "pro-token";
  process.env.MERCADOPAGO_ACCESS_TOKEN = "legacy-token";

  const service = new PlansService({} as never, {} as never);
  const token = (
    service as unknown as { getProAccessToken: () => string | null }
  ).getProAccessToken();

  assert.equal(token, "pro-token");

  if (originalProToken === undefined)
    delete process.env.MERCADOPAGO_PRO_ACCESS_TOKEN;
  else process.env.MERCADOPAGO_PRO_ACCESS_TOKEN = originalProToken;
  if (originalLegacyToken === undefined)
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  else process.env.MERCADOPAGO_ACCESS_TOKEN = originalLegacyToken;
});

test("createCheckout updates existing none purchase to pending before returning Brick URL", async () => {
  const originalMode = process.env.PAYMENT_CHECKOUT_MODE;
  const originalFrontendUrl = process.env.FRONTEND_URL;

  process.env.PAYMENT_CHECKOUT_MODE = "brick";
  process.env.PAYMENT_BRICK_ENABLED = "false";
  process.env.FRONTEND_URL = "https://earlycv.com.br";

  const updates: Array<{ id: string; status: string }> = [];

  const service = new PlansService(
    {
      planPurchase: {
        findFirst: async () => ({
          id: "purchase-existing-none",
          userId: "user-1",
          planType: "starter",
          status: "none",
          paymentReference: "pay-ref-existing",
        }),
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; userId?: string };
          data: { status: string };
        }) => {
          updates.push({
            id: where.id,
            status: data.status,
          });

          assert.equal(where.id, "purchase-existing-none");
          assert.equal(where.userId, "user-1");

          return { count: 1 };
        },
      },
      user: {
        findUnique: async () => ({
          email: "user-1@earlycv.com.br",
          name: "User One",
        }),
      },
    } as never,
    {
      record: async () => ({ event: { id: "evt-brick-4" }, ingested: true }),
    } as never,
  );

  (
    service as { createMercadoPagoPreference: () => Promise<string> }
  ).createMercadoPagoPreference = async () => {
    throw new Error("checkout pro should not be called");
  };

  try {
    const result = await service.createCheckout("user-1", "starter");
    assert.equal(
      result.checkoutUrl,
      "https://earlycv.com.br/pagamento/checkout/purchase-existing-none",
    );
    assert.deepEqual(updates, [
      { id: "purchase-existing-none", status: "pending" },
    ]);
  } finally {
    if (originalMode === undefined) delete process.env.PAYMENT_CHECKOUT_MODE;
    else process.env.PAYMENT_CHECKOUT_MODE = originalMode;
    delete process.env.PAYMENT_BRICK_ENABLED;
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  }
});

test("applyApprovedPurchase applies pending purchase once", async () => {
  let applyCalls = 0;
  const service = new PlansService(
    {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          planPurchase: {
            findUnique: async () => ({
              id: "purchase-pending-1",
              userId: "user-1",
              planType: "starter",
              paymentReference: "ref-1",
              status: "pending",
              creditsGranted: 3,
              analysisCreditsGranted: 0,
              originAction: "buy_credits",
              originAdaptationId: null,
              mpPaymentId: null,
              mpMerchantOrderId: null,
              mpPreferenceId: null,
            }),
            update: async () => ({ ok: true }),
          },
          user: { update: async () => ({ ok: true }) },
          cvUnlock: { upsert: async () => ({ ok: true }) },
          cvAdaptation: {
            findUnique: async () => null,
            update: async () => ({ ok: true }),
          },
        }),
      paymentAuditLog: { create: async () => ({ id: "audit-apply-1" }) },
    } as never,
    { record: async () => ({ event: { id: "evt-apply-1" }, ingested: true }) } as never,
  );

  (
    service as unknown as {
      applyApprovedPurchaseInsideTransaction: (
        tx: unknown,
        purchase: { id: string },
      ) => Promise<void>;
    }
  ).applyApprovedPurchaseInsideTransaction = async (_tx, purchase) => {
    applyCalls += 1;
    assert.equal(purchase.id, "purchase-pending-1");
  };

  const result = await service.applyApprovedPurchase("purchase-pending-1");
  assert.equal(result, true);
  assert.equal(applyCalls, 1);
});

test("applyApprovedPurchase applies processing statuses once", async () => {
  const statuses = ["processing_payment", "pending_payment"];

  for (const status of statuses) {
    let applyCalls = 0;
    const service = new PlansService(
      {
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            planPurchase: {
              findUnique: async () => ({
                id: `purchase-${status}`,
                userId: "user-1",
                planType: "starter",
                paymentReference: `ref-${status}`,
                status,
                creditsGranted: 3,
                analysisCreditsGranted: 0,
                originAction: "buy_credits",
                originAdaptationId: null,
                mpPaymentId: null,
                mpMerchantOrderId: null,
                mpPreferenceId: null,
              }),
              update: async () => ({ ok: true }),
            },
            user: { update: async () => ({ ok: true }) },
            cvUnlock: { upsert: async () => ({ ok: true }) },
            cvAdaptation: {
              findUnique: async () => null,
              update: async () => ({ ok: true }),
            },
          }),
        paymentAuditLog: { create: async () => ({ id: `audit-${status}` }) },
      } as never,
      {
        record: async () => ({
          event: { id: `evt-${status}` },
          ingested: true,
        }),
      } as never,
    );

    (
      service as unknown as {
        applyApprovedPurchaseInsideTransaction: (
          tx: unknown,
          purchase: { status: string },
        ) => Promise<void>;
      }
    ).applyApprovedPurchaseInsideTransaction = async (_tx, purchase) => {
      applyCalls += 1;
      assert.equal(purchase.status, status);
    };

    const result = await service.applyApprovedPurchase(`purchase-${status}`);
    assert.equal(result, true);
    assert.equal(applyCalls, 1);
  }
});

test("applyApprovedPurchase is idempotent for completed and blocked for failed/refunded", async () => {
  const blockedStatuses = ["completed", "failed", "refunded"];

  for (const status of blockedStatuses) {
    let applyCalls = 0;
    const service = new PlansService(
      {
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            planPurchase: {
              findUnique: async () => ({
                id: `purchase-${status}`,
                userId: "user-1",
                planType: "starter",
                paymentReference: `ref-${status}`,
                status,
                creditsGranted: 3,
                analysisCreditsGranted: 0,
                originAction: "buy_credits",
                originAdaptationId: null,
                mpPaymentId: null,
                mpMerchantOrderId: null,
                mpPreferenceId: null,
              }),
              update: async () => ({ ok: true }),
            },
            user: { update: async () => ({ ok: true }) },
            cvUnlock: { upsert: async () => ({ ok: true }) },
            cvAdaptation: {
              findUnique: async () => null,
              update: async () => ({ ok: true }),
            },
          }),
        paymentAuditLog: { create: async () => ({ id: `audit-${status}` }) },
      } as never,
      {
        record: async () => ({
          event: { id: `evt-${status}` },
          ingested: true,
        }),
      } as never,
    );

    (
      service as unknown as {
        applyApprovedPurchaseInsideTransaction: () => Promise<void>;
      }
    ).applyApprovedPurchaseInsideTransaction = async () => {
      applyCalls += 1;
    };

    const result = await service.applyApprovedPurchase(`purchase-${status}`);
    assert.equal(result, false);
    assert.equal(applyCalls, 0);
  }
});
