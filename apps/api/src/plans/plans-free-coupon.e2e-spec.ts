import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";
import { PlansService } from "./plans.service";

type RegisterResult = {
  accessToken: string;
  email: string;
  userId: string;
};

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
};

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();

  return { app, database: app.get(DatabaseService) };
}

async function deleteUserByEmail(database: DatabaseService, email: string) {
  await (database.user as DeleteManyDelegate).deleteMany({ where: { email } });
}

async function registerUser(
  app: INestApplication,
  database: DatabaseService,
  prefix: string,
): Promise<RegisterResult> {
  const email = `${prefix}+${randomUUID()}@earlycv.dev`;
  await deleteUserByEmail(database, email);

  const response = await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({
      email,
      password: "Super-secret-123",
      name: `${prefix} User`,
    });

  assert.equal(response.status, 201, JSON.stringify(response.body));
  return {
    accessToken: response.body.accessToken as string,
    email,
    userId: response.body.user.id as string,
  };
}

async function createFreeCampaign(
  database: DatabaseService,
  overrides: { freeRedemptionLimitTotal: number },
) {
  const partner = await database.affiliatePartner.create({
    data: {
      name: `Criador ${randomUUID()}`,
      slug: `criador-${randomUUID()}`,
      status: "active",
    },
  });
  const campaign = await database.affiliateCampaign.create({
    data: {
      name: "Campanha 100%",
      status: "active",
      eligiblePlanIds: ["starter"],
      defaultDiscountType: "percentage",
      defaultDiscountValue: 100,
      freeRedemptionLimitTotal: overrides.freeRedemptionLimitTotal,
    },
  });
  const code = await database.affiliateCode.create({
    data: {
      campaignId: campaign.id,
      partnerId: partner.id,
      code: `FREE${randomUUID().slice(0, 8).toUpperCase()}`,
      status: "active",
    },
  });
  return { partner, campaign, code };
}

test("two concurrent free-coupon redemptions disputing the last total slot: only one succeeds", async () => {
  const { app, database } = await createApp();
  const userA = await registerUser(app, database, "p-free-total-a");
  const userB = await registerUser(app, database, "p-free-total-b");
  const { campaign, code } = await createFreeCampaign(database, {
    freeRedemptionLimitTotal: 1,
  });

  try {
    const plansService = app.get(PlansService);

    const results = await Promise.allSettled([
      plansService.redeemFreeCoupon(userA.userId, "starter", code.code),
      plansService.redeemFreeCoupon(userB.userId, "starter", code.code),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const refreshedCampaign = await database.affiliateCampaign.findUnique({
      where: { id: campaign.id },
      select: { freeRedemptionsUsed: true },
    });
    assert.equal(refreshedCampaign?.freeRedemptionsUsed, 1);

    const redemptions = await database.affiliateFreeRedemption.findMany({
      where: { affiliateCampaignId: campaign.id },
    });
    assert.equal(redemptions.length, 1);
  } finally {
    await deleteUserByEmail(database, userA.email);
    await deleteUserByEmail(database, userB.email);
    await app.close();
  }
});

test("two concurrent free-coupon redemptions by the same user: only one succeeds", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-free-peruser");
  const { campaign, code } = await createFreeCampaign(database, {
    freeRedemptionLimitTotal: 50,
  });

  try {
    const plansService = app.get(PlansService);

    const results = await Promise.allSettled([
      plansService.redeemFreeCoupon(user.userId, "starter", code.code),
      plansService.redeemFreeCoupon(user.userId, "starter", code.code),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const redemptions = await database.affiliateFreeRedemption.findMany({
      where: { affiliateCampaignId: campaign.id, userId: user.userId },
    });
    assert.equal(redemptions.length, 1);

    const refreshedUser = await database.user.findUnique({
      where: { id: user.userId },
      select: { creditsRemaining: true },
    });
    // Só um resgate concedeu crédito (starter = 3 créditos), nunca 6.
    assert.equal(refreshedUser?.creditsRemaining, 3);
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("createCheckout with a coupon that zeroes the price never writes a PlanPurchase, only redeemFreeCoupon does", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-free-preview-noop");
  const { code } = await createFreeCampaign(database, {
    freeRedemptionLimitTotal: 10,
  });

  try {
    const plansService = app.get(PlansService);

    const before = await database.planPurchase.count({
      where: { userId: user.userId },
    });

    const preview = await plansService.createCheckout(
      user.userId,
      "starter",
      undefined,
      [],
      undefined,
      code.code,
    );
    assert.equal(preview.checkoutMode, "free_coupon_confirmation_required");
    assert.equal(preview.amountInCents, 0);
    assert.equal(preview.purchaseId, null);

    const afterPreview = await database.planPurchase.count({
      where: { userId: user.userId },
    });
    assert.equal(afterPreview, before);

    const redeemed = await plansService.redeemFreeCoupon(
      user.userId,
      "starter",
      code.code,
    );
    assert.ok(redeemed.purchaseId);

    const purchase = await database.planPurchase.findUnique({
      where: { id: redeemed.purchaseId },
      select: {
        status: true,
        paymentProvider: true,
        paidAt: true,
        couponRedeemedAt: true,
        amountInCents: true,
      },
    });
    assert.equal(purchase?.status, "completed");
    assert.equal(purchase?.paymentProvider, "internal_coupon");
    assert.equal(purchase?.amountInCents, 0);
    // Nunca finge que houve pagamento.
    assert.equal(purchase?.paidAt, null);
    assert.ok(purchase?.couponRedeemedAt);
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});
