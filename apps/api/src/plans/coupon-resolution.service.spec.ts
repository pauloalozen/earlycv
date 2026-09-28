import assert from "node:assert/strict";
import { test } from "node:test";
import { CouponResolutionService } from "./coupon-resolution.service";

type CampaignOverrides = Partial<{
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  eligiblePlanIds: string[];
  defaultDiscountType: string | null;
  defaultDiscountValue: number | null;
  creditBonusType: string | null;
  creditBonusValue: number | null;
  freeRedemptionLimitTotal: number | null;
}>;

function makeCampaign(overrides: CampaignOverrides = {}) {
  return {
    id: "camp-1",
    status: "active",
    startsAt: null,
    endsAt: null,
    eligiblePlanIds: ["starter", "pro", "turbo"],
    defaultDiscountType: null,
    defaultDiscountValue: null,
    creditBonusType: null,
    creditBonusValue: null,
    freeRedemptionLimitTotal: null,
    ...overrides,
  };
}

function makeService(
  codeRecord:
    | ({ id: string; code: string; status: string; campaignId: string } & {
        campaign: ReturnType<typeof makeCampaign>;
      })
    | null,
) {
  return new CouponResolutionService({
    affiliateCode: {
      findUnique: async () => codeRecord,
    },
  } as never);
}

test("resolveForAcquisition returns missing_code for empty input", async () => {
  const service = makeService(null);
  const result = await service.resolveForAcquisition("  ");
  assert.deepEqual(result, { valid: false, reason: "missing_code" });
});

test("resolveForAcquisition returns code_not_found when code does not exist", async () => {
  const service = makeService(null);
  const result = await service.resolveForAcquisition("NOPE");
  assert.deepEqual(result, { valid: false, reason: "code_not_found" });
});

test("resolveForAcquisition returns code_inactive when code status is not active", async () => {
  const service = makeService({
    id: "code-1",
    code: "CRIADOR10",
    status: "draft",
    campaignId: "camp-1",
    campaign: makeCampaign(),
  });
  const result = await service.resolveForAcquisition("CRIADOR10");
  assert.deepEqual(result, { valid: false, reason: "code_inactive" });
});

test("resolveForAcquisition returns campaign_inactive when campaign status is not active", async () => {
  const service = makeService({
    id: "code-1",
    code: "CRIADOR10",
    status: "active",
    campaignId: "camp-1",
    campaign: makeCampaign({ status: "inactive" }),
  });
  const result = await service.resolveForAcquisition("CRIADOR10");
  assert.deepEqual(result, { valid: false, reason: "campaign_inactive" });
});

test("resolveForAcquisition returns campaign_not_started before startsAt", async () => {
  const service = makeService({
    id: "code-1",
    code: "CRIADOR10",
    status: "active",
    campaignId: "camp-1",
    campaign: makeCampaign({
      startsAt: new Date(Date.now() + 1000 * 60 * 60),
    }),
  });
  const result = await service.resolveForAcquisition("CRIADOR10");
  assert.deepEqual(result, { valid: false, reason: "campaign_not_started" });
});

test("resolveForAcquisition returns campaign_ended after endsAt", async () => {
  const service = makeService({
    id: "code-1",
    code: "CRIADOR10",
    status: "active",
    campaignId: "camp-1",
    campaign: makeCampaign({
      endsAt: new Date(Date.now() - 1000 * 60 * 60),
    }),
  });
  const result = await service.resolveForAcquisition("CRIADOR10");
  assert.deepEqual(result, { valid: false, reason: "campaign_ended" });
});

test("resolveForAcquisition returns valid for an active code within vigência", async () => {
  const service = makeService({
    id: "code-1",
    code: "CRIADOR10",
    status: "active",
    campaignId: "camp-1",
    campaign: makeCampaign(),
  });
  const result = await service.resolveForAcquisition("CRIADOR10");
  assert.equal(result.valid, true);
});

test("resolveForAcquisition is case-insensitive — lowercase input still matches the stored uppercase code", async () => {
  let queriedCode: string | undefined;
  const service = new CouponResolutionService({
    affiliateCode: {
      findUnique: async ({ where }: { where: { code: string } }) => {
        queriedCode = where.code;
        return {
          id: "code-1",
          code: "CRIADOR10",
          status: "active",
          campaignId: "camp-1",
          campaign: makeCampaign(),
        };
      },
    },
  } as never);

  const result = await service.resolveForAcquisition("criador10");
  assert.equal(queriedCode, "CRIADOR10");
  assert.equal(result.valid, true);
});

test("resolveForCheckout returns plan_not_eligible when plan is outside eligiblePlanIds", async () => {
  const service = makeService({
    id: "code-1",
    code: "CRIADOR10",
    status: "active",
    campaignId: "camp-1",
    campaign: makeCampaign({ eligiblePlanIds: ["pro"] }),
  });
  const result = await service.resolveForCheckout(
    "CRIADOR10",
    "starter",
    1190,
    3,
  );
  assert.deepEqual(result, { valid: false, reason: "plan_not_eligible" });
});

test("resolveForCheckout computes percentage discount correctly", async () => {
  const service = makeService({
    id: "code-1",
    code: "CRIADOR10",
    status: "active",
    campaignId: "camp-1",
    campaign: makeCampaign({
      defaultDiscountType: "percentage",
      defaultDiscountValue: 50,
    }),
  });
  const result = await service.resolveForCheckout(
    "CRIADOR10",
    "starter",
    1190,
    3,
  );
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.discountAmountInCents, 595);
    assert.equal(result.amountInCents, 595);
    assert.equal(result.creditsGranted, 3);
  }
});

test("resolveForCheckout computes fixed_amount discount clamped to base price", async () => {
  const service = makeService({
    id: "code-1",
    code: "CRIADOR10",
    status: "active",
    campaignId: "camp-1",
    campaign: makeCampaign({
      defaultDiscountType: "fixed_amount",
      defaultDiscountValue: 999999,
      freeRedemptionLimitTotal: 50,
    }),
  });
  const result = await service.resolveForCheckout(
    "CRIADOR10",
    "starter",
    1190,
    3,
  );
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.discountAmountInCents, 1190);
    assert.equal(result.amountInCents, 0);
  }
});

test("resolveForCheckout with 100% discount and no freeRedemptionLimitTotal is invalid (safety net)", async () => {
  const service = makeService({
    id: "code-1",
    code: "CRIADOR10",
    status: "active",
    campaignId: "camp-1",
    campaign: makeCampaign({
      defaultDiscountType: "percentage",
      defaultDiscountValue: 100,
      freeRedemptionLimitTotal: null,
    }),
  });
  const result = await service.resolveForCheckout(
    "CRIADOR10",
    "starter",
    1190,
    3,
  );
  assert.deepEqual(result, {
    valid: false,
    reason: "free_redemption_not_configured",
  });
});

test("resolveForCheckout with 100% discount and freeRedemptionLimitTotal set is valid", async () => {
  const service = makeService({
    id: "code-1",
    code: "CRIADOR10",
    status: "active",
    campaignId: "camp-1",
    campaign: makeCampaign({
      defaultDiscountType: "percentage",
      defaultDiscountValue: 100,
      freeRedemptionLimitTotal: 50,
    }),
  });
  const result = await service.resolveForCheckout(
    "CRIADOR10",
    "starter",
    1190,
    3,
  );
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.amountInCents, 0);
  }
});

test("resolveForCheckout computes multiplier credit bonus (2x)", async () => {
  const service = makeService({
    id: "code-1",
    code: "CRIADOR10",
    status: "active",
    campaignId: "camp-1",
    campaign: makeCampaign({
      creditBonusType: "multiplier",
      creditBonusValue: 2,
    }),
  });
  const result = await service.resolveForCheckout(
    "CRIADOR10",
    "starter",
    1190,
    3,
  );
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.bonusCreditsGranted, 3);
    assert.equal(result.creditsGranted, 6);
    assert.equal(result.amountInCents, 1190);
  }
});

test("resolveForCheckout computes fixed_extra credit bonus", async () => {
  const service = makeService({
    id: "code-1",
    code: "CRIADOR10",
    status: "active",
    campaignId: "camp-1",
    campaign: makeCampaign({
      creditBonusType: "fixed_extra",
      creditBonusValue: 5,
    }),
  });
  const result = await service.resolveForCheckout(
    "CRIADOR10",
    "starter",
    1190,
    3,
  );
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.bonusCreditsGranted, 5);
    assert.equal(result.creditsGranted, 8);
  }
});
