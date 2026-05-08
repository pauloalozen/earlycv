import assert from "node:assert/strict";
import { test } from "node:test";
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

  assert.equal(findUniqueCalls, 1);
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
