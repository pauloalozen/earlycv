import assert from "node:assert/strict";
import { test } from "node:test";
import { PlansService } from "./plans.service";

test("records payment_failed when webhook resolution marks failed", async () => {
  const recordedEvents: Array<{ eventName: string; source: string }> = [];
  let findUniqueCalls = 0;

  const service = new PlansService(
    {
      planPurchase: {
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
        input: { eventName: string },
        _context: unknown,
        source: string,
      ) => {
        recordedEvents.push({
          eventName: input.eventName,
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
    paymentReference: "pay-ref-1",
    status: "failed",
  });

  await service.handleWebhook("mercadopago", {
    data: { id: "mp-1" },
    type: "payment",
  });

  assert.equal(findUniqueCalls, 1);
  assert.equal(recordedEvents.length, 1);
  assert.deepEqual(recordedEvents[0], {
    eventName: "payment_failed",
    source: "backend",
  });
});

test("marks purchase as failed before recording payment_failed", async () => {
  const updatedStatuses: string[] = [];
  const recordedEvents: string[] = [];

  const service = new PlansService(
    {
      planPurchase: {
        findUnique: async () => ({
          id: "purchase-failed-1",
          status: "pending",
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
      record: async (input: { eventName: string }) => {
        recordedEvents.push(input.eventName);
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
    paymentReference: "pay-ref-failed-1",
    status: "failed",
  });

  await service.handleWebhook("mercadopago", {
    data: { id: "mp-failed-1" },
    type: "payment",
  });

  assert.deepEqual(updatedStatuses, ["failed"]);
  assert.deepEqual(recordedEvents, ["payment_failed"]);
});

test("does not record payment_failed when webhook resolution is approved", async () => {
  const recordedEvents: string[] = [];

  const service = new PlansService(
    {
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
      ) => Promise<string>;
    }
  ).createMercadoPagoPreference = async (
    purchaseId,
    paymentReference,
    plan,
  ) => {
    assert.equal(purchaseId, "purchase-1");
    assert.equal(paymentReference, "pay-ref-1");
    assert.equal(plan.amountInCents, 2990);
    assert.equal(plan.downloadCreditsGranted, 3);
    assert.equal(plan.analysisCreditsGranted, 9);
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
