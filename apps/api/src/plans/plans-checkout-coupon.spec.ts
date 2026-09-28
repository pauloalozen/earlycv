import assert from "node:assert/strict";
import { test } from "node:test";
import type { CouponResolutionService } from "./coupon-resolution.service";
import { PlansService } from "./plans.service";

function makeCouponService(
  result:
    | {
        valid: true;
        code: { id: string; code: string };
        campaign: { id: string; name: string };
        amountInCents: number;
        creditsGranted: number;
        discountAmountInCents: number;
        bonusCreditsGranted: number;
      }
    | { valid: false; reason: string },
) {
  return {
    resolveForCheckout: async () => result,
    resolveForAcquisition: async () => result,
  } as unknown as CouponResolutionService;
}

test("createCheckout applies a valid coupon's discount and persists the snapshot", async () => {
  let createdData: Record<string, unknown> | null = null;

  const service = new PlansService(
    {
      planPurchase: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdData = data;
          return { id: "purchase-coupon-1", paymentReference: "ref-1" };
        },
      },
      user: {
        findUnique: async () => ({ email: "a@b.com", name: "User" }),
      },
    } as never,
    { record: async () => ({ event: { id: "evt" }, ingested: true }) } as never,
    undefined,
    makeCouponService({
      valid: true,
      code: { id: "code-1", code: "CRIADOR50" },
      campaign: { id: "camp-1", name: "Campanha Criador" },
      amountInCents: 595,
      creditsGranted: 3,
      discountAmountInCents: 595,
      bonusCreditsGranted: 0,
    }),
  );

  (
    service as { createMercadoPagoPreference: () => Promise<string> }
  ).createMercadoPagoPreference = async () => "https://mp.test/checkout/x";

  const result = await service.createCheckout(
    "user-1",
    "starter",
    undefined,
    [],
    undefined,
    "CRIADOR50",
  );

  assert.equal(result.amountInCents, 595);
  assert.equal(result.appliedCoupon?.code.code, "CRIADOR50");
  assert.equal(createdData?.amountInCents, 595);
  assert.equal(createdData?.affiliateCodeId, "code-1");
  assert.equal(createdData?.affiliateCampaignId, "camp-1");
  assert.equal(createdData?.couponDiscountAmountInCents, 595);
});

test("createCheckout ignores an invalid coupon silently and charges full price", async () => {
  let createdData: Record<string, unknown> | null = null;

  const service = new PlansService(
    {
      planPurchase: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdData = data;
          return { id: "purchase-invalid-coupon-1", paymentReference: "ref-2" };
        },
      },
      user: {
        findUnique: async () => ({ email: "a@b.com", name: "User" }),
      },
    } as never,
    { record: async () => ({ event: { id: "evt" }, ingested: true }) } as never,
    undefined,
    makeCouponService({ valid: false, reason: "code_not_found" }),
  );

  (
    service as { createMercadoPagoPreference: () => Promise<string> }
  ).createMercadoPagoPreference = async () => "https://mp.test/checkout/x";

  const result = await service.createCheckout(
    "user-1",
    "starter",
    undefined,
    [],
    undefined,
    "NAOEXISTE",
  );

  assert.equal(result.appliedCoupon, null);
  assert.equal(createdData?.affiliateCodeId, null);
  assert.ok(result.checkoutUrl);
});

test("createCheckout does not reuse an existing purchase when the coupon snapshot diverges", async () => {
  let createCalls = 0;

  const service = new PlansService(
    {
      planPurchase: {
        // Compra existente sem cupom (affiliateCodeId null, valor cheio).
        findFirst: async () => ({
          id: "purchase-old-1",
          userId: "user-1",
          amountInCents: 1190,
          creditsGranted: 3,
          affiliateCodeId: null,
          paymentReference: "ref-old-1",
          status: "none",
        }),
        create: async () => {
          createCalls += 1;
          return { id: "purchase-new-1", paymentReference: "ref-new-1" };
        },
      },
      user: {
        findUnique: async () => ({ email: "a@b.com", name: "User" }),
      },
    } as never,
    { record: async () => ({ event: { id: "evt" }, ingested: true }) } as never,
    undefined,
    makeCouponService({
      valid: true,
      code: { id: "code-2", code: "CRIADOR20" },
      campaign: { id: "camp-2", name: "Campanha 2" },
      amountInCents: 952,
      creditsGranted: 3,
      discountAmountInCents: 238,
      bonusCreditsGranted: 0,
    }),
  );

  (
    service as { createMercadoPagoPreference: () => Promise<string> }
  ).createMercadoPagoPreference = async () => "https://mp.test/checkout/x";

  const result = await service.createCheckout(
    "user-1",
    "starter",
    undefined,
    [],
    undefined,
    "CRIADOR20",
  );

  // A compra antiga (sem cupom) não pode ser reaproveitada para uma oferta
  // com cupom — precisa criar uma nova, nunca mutar a existente.
  assert.equal(createCalls, 1);
  assert.equal(result.purchaseId, "purchase-new-1");
});
