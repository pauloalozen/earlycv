import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { EmailDispatchService } from "../email-dispatch/email-dispatch.service";
import { createConfig } from "../email-dispatch/email-dispatch.test-support";
import { PlansService } from "./plans.service";
import { PurchaseConfirmationRecoveryService } from "./purchase-confirmation-recovery.service";

// Teste com BANCO REAL (mesmo padrão das specs de auth): prova que TODO
// caminho de aprovação de compra enfileira UMA confirmação, dentro da
// transação de crédito, e que uma falha do enfileiramento nunca impede os
// créditos (erro SQL real + SAVEPOINT).

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const createdUserIds: string[] = [];
const createdCampaignIds: string[] = [];
const createdPartnerIds: string[] = [];

after(async () => {
  await prisma.emailDispatch.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.planPurchase.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.affiliateCode.deleteMany({
    where: { campaignId: { in: createdCampaignIds } },
  });
  await prisma.affiliateCampaign.deleteMany({
    where: { id: { in: createdCampaignIds } },
  });
  await prisma.affiliatePartner.deleteMany({
    where: { id: { in: createdPartnerIds } },
  });
  await prisma.$disconnect();
});

function buildConfig(mode: "OFF" | "SHADOW" | "LIVE" = "SHADOW") {
  return createConfig(
    {
      EMAIL_PURCHASE_CONFIRMATION_MODE: mode,
      EMAIL_RELATIONSHIP_START_AT: "2020-01-01T00:00:00.000Z",
    },
    { production: true },
  );
}

function buildDispatch(mode: "OFF" | "SHADOW" | "LIVE" = "SHADOW") {
  return new EmailDispatchService(
    database,
    buildConfig(mode),
    { send: async () => ({ outcome: "SENT" }) } as never,
    { findByEmail: async () => null },
  );
}

function buildRecovery(mode: "OFF" | "SHADOW" | "LIVE" = "SHADOW") {
  const config = buildConfig(mode);
  const dispatch = new EmailDispatchService(
    database,
    config,
    { send: async () => ({ outcome: "SENT" }) } as never,
    { findByEmail: async () => null },
  );
  return new PurchaseConfirmationRecoveryService(database, dispatch, config);
}

function buildPlans(
  dispatch: Pick<
    EmailDispatchService,
    "enqueuePurchaseConfirmationInTransaction"
  >,
  db: DatabaseService = database,
  coupon?: unknown,
) {
  return new PlansService(
    db,
    { record: async () => ({ event: {}, ingested: false }) } as never,
    undefined,
    coupon as never,
    undefined,
    dispatch,
  );
}

async function createUser() {
  const id = `u_${randomUUID()}`;
  createdUserIds.push(id);
  return prisma.user.create({
    data: {
      id,
      email: `${id}@example.com`,
      name: "Maria Souza",
      status: "active",
      emailVerifiedAt: new Date(),
    },
  });
}

async function createPurchase(
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.planPurchase.create({
    data: {
      userId,
      planType: "pro",
      amountInCents: 4990,
      currency: "BRL",
      paymentProvider: "mercadopago",
      paymentReference: randomUUID(),
      status: "pending_payment",
      creditsGranted: 5,
      analysisCreditsGranted: 5,
      originAction: "buy_credits",
      ...overrides,
    },
  });
}

const dispatchRows = (userId: string) =>
  prisma.emailDispatch.findMany({ where: { userId } });
const userCredits = async (userId: string) =>
  prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { creditsRemaining: true, analysisCreditsRemaining: true },
  });

test("applyApprovedPurchase: credits applied and exactly ONE confirmation queued (frozen snapshot); repeating changes nothing", async () => {
  const user = await createUser();
  const purchase = await createPurchase(user.id);
  const plans = buildPlans(buildDispatch());

  assert.equal(await plans.applyApprovedPurchase(purchase.id), true);
  assert.equal(await plans.applyApprovedPurchase(purchase.id), false);

  assert.deepEqual(await userCredits(user.id), {
    creditsRemaining: 5,
    analysisCreditsRemaining: 5,
  });
  const rows = await dispatchRows(user.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "PURCHASE_CONFIRMATION");
  assert.equal(rows[0].dedupeKey, `purchase:${purchase.id}`);
  assert.equal(rows[0].referenceId, purchase.id);
  assert.equal(rows[0].recipientEmail, user.email);
  assert.deepEqual(rows[0].payloadJson, {
    planType: "pro",
    amountInCents: 4990,
    currency: "BRL",
    credits: 5,
    analysisCredits: 5,
    isUnlimited: false,
    isCouponRedemption: false,
  });
});

test("concurrent approvals: one credit, one confirmation", async () => {
  const user = await createUser();
  const purchase = await createPurchase(user.id);
  const plans = buildPlans(buildDispatch());

  const results = await Promise.all(
    Array.from({ length: 6 }, () => plans.applyApprovedPurchase(purchase.id)),
  );

  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await userCredits(user.id)).creditsRemaining, 5);
  assert.equal((await dispatchRows(user.id)).length, 1);
});

test("mode OFF (default): credits granted and NO e-mail row is created", async () => {
  const user = await createUser();
  const purchase = await createPurchase(user.id);
  const plans = buildPlans(buildDispatch("OFF"));

  assert.equal(await plans.applyApprovedPurchase(purchase.id), true);

  assert.equal((await userCredits(user.id)).creditsRemaining, 5);
  assert.equal((await dispatchRows(user.id)).length, 0);
});

test("webhook approval path (Mercado Pago): queues the confirmation too", async () => {
  const user = await createUser();
  const purchase = await createPurchase(user.id);
  const plans = buildPlans(buildDispatch());
  // biome-ignore lint/suspicious/noExplicitAny: stub da chamada de rede ao MP
  (plans as any).resolveMercadoPagoPayment = async () => ({
    purchaseId: purchase.id,
    externalReference: null,
    paymentReference: purchase.paymentReference,
    status: "approved",
    paymentId: "mp-1",
    merchantOrderId: null,
    preferenceId: null,
    rawStatus: "approved",
    statusDetail: null,
    paymentMethod: "pix",
    paidAmountInCents: 4990,
    paidCurrency: "BRL",
  });

  await plans.handleWebhook("mercadopago", {});
  await plans.handleWebhook("mercadopago", {}); // reentrega do MP

  assert.equal((await userCredits(user.id)).creditsRemaining, 5);
  const rows = await dispatchRows(user.id);
  assert.equal(rows.length, 1);
  assert.equal(
    (rows[0].payloadJson as { isCouponRedemption: boolean }).isCouponRedemption,
    false,
  );
});

test("100% coupon redemption path: queues a REDEMPTION confirmation (no payment claimed), never a paid one", async () => {
  const user = await createUser();
  const partner = await prisma.affiliatePartner.create({
    data: { name: "P", slug: `p-${randomUUID()}`, status: "active" },
  });
  createdPartnerIds.push(partner.id);
  const campaign = await prisma.affiliateCampaign.create({
    data: {
      name: "C",
      status: "active",
      freeRedemptionLimitTotal: 10,
      eligiblePlanIds: ["starter"],
    },
  });
  createdCampaignIds.push(campaign.id);
  const code = await prisma.affiliateCode.create({
    data: {
      campaignId: campaign.id,
      partnerId: partner.id,
      code: `C${randomUUID().slice(0, 8)}`.toUpperCase(),
      status: "active",
    },
  });
  const coupon = {
    resolveForCheckout: async () => ({
      valid: true,
      amountInCents: 0,
      creditsGranted: 3,
      bonusCreditsGranted: 0,
      discountAmountInCents: 1190,
      campaign: { id: campaign.id, freeRedemptionLimitTotal: 10 },
      code: { id: code.id },
    }),
  };
  const plans = buildPlans(buildDispatch(), database, coupon);

  const result = await plans.redeemFreeCoupon(user.id, "starter", code.code);

  assert.equal(result.creditsGranted, 3);
  assert.equal((await userCredits(user.id)).creditsRemaining, 3);
  const rows = await dispatchRows(user.id);
  assert.equal(rows.length, 1);
  const payload = rows[0].payloadJson as Record<string, unknown>;
  assert.equal(payload.isCouponRedemption, true);
  assert.equal(payload.amountInCents, 0);
  assert.equal(rows[0].referenceId, result.purchaseId);
});

function failingEnqueueDatabase(): DatabaseService {
  // Entrega à PlansService uma transação em que o INSERT da confirmação
  // executa um erro SQL REAL do Postgres (violação NOT NULL) — o tipo de
  // erro que, sem SAVEPOINT, aborta a transação inteira e derruba os
  // créditos.
  return new Proxy(database, {
    get(target, prop, receiver) {
      if (prop === "$transaction") {
        // biome-ignore lint/suspicious/noExplicitAny: wrapper de teste
        return (callback: (tx: any) => unknown, options?: unknown) =>
          // biome-ignore lint/suspicious/noExplicitAny: wrapper de teste
          (target.$transaction as any)(
            // biome-ignore lint/suspicious/noExplicitAny: wrapper de teste
            (tx: any) =>
              callback(
                new Proxy(tx, {
                  get(txTarget, txProp) {
                    if (txProp === "emailDispatch") {
                      return {
                        ...txTarget.emailDispatch,
                        createMany: async () => {
                          await txTarget.$executeRawUnsafe(
                            `INSERT INTO "EmailDispatch" ("id") VALUES (NULL)`,
                          );
                        },
                      };
                    }
                    return Reflect.get(txTarget, txProp);
                  },
                }),
              ),
            options,
          );
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

test("a REAL SQL failure while queueing the confirmation never blocks the credits (SAVEPOINT absorbs it)", async () => {
  const user = await createUser();
  const purchase = await createPurchase(user.id);
  const plans = buildPlans(buildDispatch(), failingEnqueueDatabase());

  assert.equal(await plans.applyApprovedPurchase(purchase.id), true);

  assert.deepEqual(await userCredits(user.id), {
    creditsRemaining: 5,
    analysisCreditsRemaining: 5,
  });
  const saved = await prisma.planPurchase.findUniqueOrThrow({
    where: { id: purchase.id },
  });
  assert.equal(saved.status, "completed");
  assert.equal((await dispatchRows(user.id)).length, 0);
});

test("purchases created before the cutoff (old purchase reconciled later) never queue an e-mail but are still credited", async () => {
  const user = await createUser();
  const old = await createPurchase(user.id, {
    createdAt: new Date("2019-01-01T00:00:00.000Z"),
  });
  const plans = buildPlans(buildDispatch());

  assert.equal(await plans.applyApprovedPurchase(old.id), true);

  assert.equal((await userCredits(user.id)).creditsRemaining, 5);
  assert.equal((await dispatchRows(user.id)).length, 0);
});

// ---- Recuperação de confirmações perdidas ---------------------------------

const missingFor = async (
  recovery: PurchaseConfirmationRecoveryService,
  purchaseId: string,
  sinceHours?: number,
) =>
  (await recovery.findMissing(sinceHours)).filter(
    (m) => m.purchaseId === purchaseId,
  );

test("LOST confirmation end-to-end: enqueue fails (credits fine) -> detected as missing -> dry-run changes nothing -> --apply recreates exactly one row -> idempotent", async () => {
  const user = await createUser();
  const purchase = await createPurchase(user.id);
  const plans = buildPlans(buildDispatch(), failingEnqueueDatabase());
  assert.equal(await plans.applyApprovedPurchase(purchase.id), true);
  assert.equal((await userCredits(user.id)).creditsRemaining, 5);
  assert.equal((await dispatchRows(user.id)).length, 0);

  const recovery = buildRecovery();
  assert.equal((await missingFor(recovery, purchase.id)).length, 1);

  const dry = await recovery.recover({ apply: false });
  assert.equal(dry.applied, false);
  assert.equal((await dispatchRows(user.id)).length, 0);

  const applied = await recovery.recover({ apply: true });
  assert.equal(applied.applied, true);
  const rows = await dispatchRows(user.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dedupeKey, `purchase:${purchase.id}`);
  assert.deepEqual(rows[0].payloadJson, {
    planType: "pro",
    amountInCents: 4990,
    currency: "BRL",
    credits: 5,
    analysisCredits: 5,
    isUnlimited: false,
    isCouponRedemption: false,
  });
  assert.equal((await missingFor(recovery, purchase.id)).length, 0);

  await recovery.recover({ apply: true }); // repetir não duplica
  assert.equal((await dispatchRows(user.id)).length, 1);
  assert.equal((await userCredits(user.id)).creditsRemaining, 5); // créditos nunca mexidos
});

test("recovery respects the mode: with purchase confirmations OFF nothing is created even with --apply", async () => {
  const user = await createUser();
  const purchase = await createPurchase(user.id);
  await buildPlans(buildDispatch("OFF")).applyApprovedPurchase(purchase.id);

  const report = await buildRecovery("OFF").recover({ apply: true });

  assert.equal(report.mode, "OFF");
  assert.equal(report.applied, false);
  assert.equal((await dispatchRows(user.id)).length, 0);
});

test("recovery only considers COMPLETED purchases inside the window and after the cutoff", async () => {
  const user = await createUser();
  const recovery = buildRecovery();
  const plans = buildPlans(buildDispatch("OFF")); // credita sem enfileirar

  const recent = await createPurchase(user.id);
  await plans.applyApprovedPurchase(recent.id);

  const old = await createPurchase(user.id);
  await plans.applyApprovedPurchase(old.id);
  await prisma.planPurchase.update({
    where: { id: old.id },
    data: { paidAt: new Date(Date.now() - 48 * 3_600_000) },
  });

  const beforeCutoff = await createPurchase(user.id, {
    createdAt: new Date("2019-01-01T00:00:00.000Z"),
  });
  await plans.applyApprovedPurchase(beforeCutoff.id);

  const pending = await createPurchase(user.id); // nunca aprovada

  assert.equal((await missingFor(recovery, recent.id)).length, 1);
  assert.equal((await missingFor(recovery, old.id)).length, 0);
  assert.equal((await missingFor(recovery, old.id, 72)).length, 1);
  assert.equal((await missingFor(recovery, beforeCutoff.id, 72)).length, 0);
  assert.equal((await missingFor(recovery, pending.id, 72)).length, 0);
});

test("recovery rebuilds a 100% coupon redemption as a REDEMPTION (no payment claimed)", async () => {
  const user = await createUser();
  const purchase = await createPurchase(user.id, {
    planType: "starter",
    amountInCents: 0,
    paymentProvider: "internal_coupon",
    creditsGranted: 3,
    analysisCreditsGranted: 3,
    status: "none",
  });
  await buildPlans(buildDispatch("OFF")).applyApprovedPurchase(purchase.id);
  // applyApprovedPurchase grava paidAt; o resgate real grava couponRedeemedAt
  await prisma.planPurchase.update({
    where: { id: purchase.id },
    data: { paidAt: null, couponRedeemedAt: new Date() },
  });

  await buildRecovery().recover({ apply: true });

  const rows = await dispatchRows(user.id);
  assert.equal(rows.length, 1);
  const payload = rows[0].payloadJson as Record<string, unknown>;
  assert.equal(payload.isCouponRedemption, true);
  assert.equal(payload.amountInCents, 0);
});
