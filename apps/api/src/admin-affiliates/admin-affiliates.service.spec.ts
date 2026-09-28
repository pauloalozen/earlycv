import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { Test } from "@nestjs/testing";

import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { AdminAffiliatesModule } from "./admin-affiliates.module";
import { AdminAffiliatesService } from "./admin-affiliates.service";

async function createModule() {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, AdminAffiliatesModule],
  }).compile();
  return {
    database: moduleRef.get(DatabaseService),
    service: moduleRef.get(AdminAffiliatesService),
  };
}

async function createPartner(database: DatabaseService) {
  return database.affiliatePartner.create({
    data: {
      name: `Criador ${randomUUID()}`,
      slug: `criador-${randomUUID()}`,
      status: "active",
    },
  });
}

test("createCampaign rejects a 100% discount campaign without freeRedemptionLimitTotal", async () => {
  const { database, service } = await createModule();
  const partner = await createPartner(database);

  let caught: unknown = null;
  try {
    await service.createCampaign({
      name: "Campanha sem teto",
      eligiblePlanIds: ["starter"],
      defaultDiscountType: "percentage",
      defaultDiscountValue: 100,
    });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "expected createCampaign to throw");
  assert.match(String((caught as Error).message), /limite total de resgates/);
});

test("createCampaign accepts a 100% discount campaign when freeRedemptionLimitTotal is set", async () => {
  const { database, service } = await createModule();
  const partner = await createPartner(database);

  const campaign = await service.createCampaign({
    name: "Campanha com teto",
    eligiblePlanIds: ["starter"],
    defaultDiscountType: "percentage",
    defaultDiscountValue: 100,
    freeRedemptionLimitTotal: 50,
  });

  assert.equal(campaign.freeRedemptionLimitTotal, 50);
});

test("createCampaign rejects a percentage discount above 100", async () => {
  const { database, service } = await createModule();
  const partner = await createPartner(database);

  let caught: unknown = null;
  try {
    await service.createCampaign({
      name: "Campanha invalida",
      eligiblePlanIds: ["starter"],
      defaultDiscountType: "percentage",
      defaultDiscountValue: 150,
    });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "expected createCampaign to throw");
  assert.match(String((caught as Error).message), /nao pode passar de 100/);
});

test("getCampaignReport counts only currently-completed purchases, excluding refunded ones", async () => {
  const { database, service } = await createModule();
  const partner = await createPartner(database);
  const campaign = await service.createCampaign({
    name: "Campanha relatorio",
    eligiblePlanIds: ["starter"],
    defaultDiscountType: "percentage",
    defaultDiscountValue: 20,
  });
  const code = await service.createCode({
    campaignId: campaign.id,
    partnerId: partner.id,
    code: `REL${randomUUID().slice(0, 8).toUpperCase()}`,
    status: "active",
  });

  const user = await database.user.create({
    data: {
      email: `report+${randomUUID()}@earlycv.dev`,
      name: "Relatorio User",
      status: "active",
    },
  });

  await database.planPurchase.create({
    data: {
      userId: user.id,
      planType: "starter",
      amountInCents: 952,
      currency: "BRL",
      paymentProvider: "mercadopago",
      paymentReference: randomUUID(),
      status: "completed",
      creditsGranted: 3,
      affiliateCodeId: code.id,
      affiliateCampaignId: campaign.id,
      couponDiscountAmountInCents: 238,
    },
  });

  await database.planPurchase.create({
    data: {
      userId: user.id,
      planType: "starter",
      amountInCents: 952,
      currency: "BRL",
      paymentProvider: "mercadopago",
      paymentReference: randomUUID(),
      status: "refunded",
      creditsGranted: 3,
      affiliateCodeId: code.id,
      affiliateCampaignId: campaign.id,
      couponDiscountAmountInCents: 238,
    },
  });

  const report = await service.getCampaignReport(campaign.id);

  assert.equal(report.metrics.approvedPurchases.value, 1);
  assert.equal(report.metrics.revenueInCents.value, 952);
});
