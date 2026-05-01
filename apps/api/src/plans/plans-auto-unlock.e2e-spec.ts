import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Prisma } from "@prisma/client";
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

async function markPurchaseAsApproved(
  app: INestApplication,
  paymentReference: string,
) {
  const plansService = app.get(PlansService) as unknown as {
    handleWebhook: (provider: string, body: unknown) => Promise<void>;
    resolveMercadoPagoPayment: (body: unknown) => Promise<{
      paymentReference: string | null;
      status: "approved" | "failed" | "pending" | "unknown";
    }>;
  };

  const originalResolve = plansService.resolveMercadoPagoPayment;
  plansService.resolveMercadoPagoPayment = async () => ({
    paymentReference,
    status: "approved",
  });

  try {
    await plansService.handleWebhook("mercadopago", {
      type: "payment",
      data: { id: "fake" },
    });
  } finally {
    plansService.resolveMercadoPagoPayment = originalResolve;
  }
}

test("buy_credits approved does not auto-unlock adaptation", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-buy-no-unlock");
  try {
    const masterResume = await database.resume.create({
      data: {
        userId: user.userId,
        title: "CV Master",
        kind: "master",
        status: "uploaded",
        rawText: "Resumo profissional",
      },
    });

    const adaptation = await database.cvAdaptation.create({
      data: {
        userId: user.userId,
        masterResumeId: masterResume.id,
        jobDescriptionText: "Descricao da vaga",
        status: "awaiting_payment",
        paymentStatus: "none",
        adaptedContentJson: {
          vaga: { cargo: "Data" },
        } as Prisma.InputJsonValue,
      },
    });

    const paymentReference = randomUUID();
    await database.planPurchase.create({
      data: {
        userId: user.userId,
        planType: "starter",
        amountInCents: 1190,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        status: "pending",
        creditsGranted: 3,
        analysisCreditsGranted: 6,
        originAction: "buy_credits",
      },
    });

    await markPurchaseAsApproved(app, paymentReference);

    const refreshedAdaptation = await database.cvAdaptation.findUnique({
      where: { id: adaptation.id },
      select: { isUnlocked: true },
    });
    assert.equal(refreshedAdaptation?.isUnlocked, false);
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("unlock_cv package 1 yields net zero and unlocks CV", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-unlock-1");
  try {
    const masterResume = await database.resume.create({
      data: {
        userId: user.userId,
        title: "CV Master",
        kind: "master",
        status: "uploaded",
        rawText: "Resumo profissional",
      },
    });

    const adaptation = await database.cvAdaptation.create({
      data: {
        userId: user.userId,
        masterResumeId: masterResume.id,
        jobDescriptionText: "Descricao da vaga",
        status: "awaiting_payment",
        paymentStatus: "none",
        adaptedContentJson: {
          vaga: { cargo: "Data" },
        } as Prisma.InputJsonValue,
      },
    });

    const paymentReference = randomUUID();
    await database.planPurchase.create({
      data: {
        userId: user.userId,
        planType: "starter",
        amountInCents: 1190,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        status: "pending",
        creditsGranted: 1,
        analysisCreditsGranted: 6,
        originAction: "unlock_cv",
        originAdaptationId: adaptation.id,
      },
    });

    await markPurchaseAsApproved(app, paymentReference);

    const refreshedUser = await database.user.findUnique({
      where: { id: user.userId },
      select: { creditsRemaining: true },
    });
    assert.equal(refreshedUser?.creditsRemaining, 0);

    const refreshedAdaptation = await database.cvAdaptation.findUnique({
      where: { id: adaptation.id },
      select: { isUnlocked: true },
    });
    assert.equal(refreshedAdaptation?.isUnlocked, true);
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("unlock_cv package 5 yields net +4 and unlocks CV", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-unlock-5");
  try {
    const masterResume = await database.resume.create({
      data: {
        userId: user.userId,
        title: "CV Master",
        kind: "master",
        status: "uploaded",
        rawText: "Resumo profissional",
      },
    });

    const adaptation = await database.cvAdaptation.create({
      data: {
        userId: user.userId,
        masterResumeId: masterResume.id,
        jobDescriptionText: "Descricao da vaga",
        status: "awaiting_payment",
        paymentStatus: "none",
        adaptedContentJson: {
          vaga: { cargo: "Data" },
        } as Prisma.InputJsonValue,
      },
    });

    const paymentReference = randomUUID();
    await database.planPurchase.create({
      data: {
        userId: user.userId,
        planType: "pro",
        amountInCents: 2990,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        status: "pending",
        creditsGranted: 5,
        analysisCreditsGranted: 9,
        originAction: "unlock_cv",
        originAdaptationId: adaptation.id,
      },
    });

    await markPurchaseAsApproved(app, paymentReference);

    const refreshedUser = await database.user.findUnique({
      where: { id: user.userId },
      select: { creditsRemaining: true },
    });
    assert.equal(refreshedUser?.creditsRemaining, 4);
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("duplicate approved webhook does not duplicate credit or debit", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-dup-webhook");
  try {
    const masterResume = await database.resume.create({
      data: {
        userId: user.userId,
        title: "CV Master",
        kind: "master",
        status: "uploaded",
        rawText: "Resumo profissional",
      },
    });

    const adaptation = await database.cvAdaptation.create({
      data: {
        userId: user.userId,
        masterResumeId: masterResume.id,
        jobDescriptionText: "Descricao da vaga",
        status: "awaiting_payment",
        paymentStatus: "none",
        adaptedContentJson: {
          vaga: { cargo: "Data" },
        } as Prisma.InputJsonValue,
      },
    });

    const paymentReference = randomUUID();
    await database.planPurchase.create({
      data: {
        userId: user.userId,
        planType: "pro",
        amountInCents: 2990,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        status: "pending",
        creditsGranted: 5,
        analysisCreditsGranted: 9,
        originAction: "unlock_cv",
        originAdaptationId: adaptation.id,
      },
    });

    await markPurchaseAsApproved(app, paymentReference);
    await markPurchaseAsApproved(app, paymentReference);

    const refreshedUser = await database.user.findUnique({
      where: { id: user.userId },
      select: { creditsRemaining: true },
    });
    assert.equal(refreshedUser?.creditsRemaining, 4);

    const unlockCount = await database.cvUnlock.count({
      where: { cvAdaptationId: adaptation.id },
    });
    assert.equal(unlockCount, 1);
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("already-unlocked adaptation does not debit again", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-unlock-already");
  try {
    const masterResume = await database.resume.create({
      data: {
        userId: user.userId,
        title: "CV Master",
        kind: "master",
        status: "uploaded",
        rawText: "Resumo profissional",
      },
    });

    const adaptation = await database.cvAdaptation.create({
      data: {
        userId: user.userId,
        masterResumeId: masterResume.id,
        jobDescriptionText: "Descricao da vaga",
        status: "paid",
        paymentStatus: "none",
        isUnlocked: true,
        unlockedAt: new Date(),
        adaptedContentJson: {
          vaga: { cargo: "Data" },
        } as Prisma.InputJsonValue,
      },
    });

    const paymentReference = randomUUID();
    const purchase = await database.planPurchase.create({
      data: {
        userId: user.userId,
        planType: "starter",
        amountInCents: 1190,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        status: "pending",
        creditsGranted: 1,
        analysisCreditsGranted: 6,
        originAction: "unlock_cv",
        originAdaptationId: adaptation.id,
      },
    });

    await markPurchaseAsApproved(app, paymentReference);

    const refreshedUser = await database.user.findUnique({
      where: { id: user.userId },
      select: { creditsRemaining: true },
    });
    const unlockCount = await database.cvUnlock.count({
      where: { cvAdaptationId: adaptation.id },
    });
    const refreshedPurchase = await database.planPurchase.findUnique({
      where: { id: purchase.id },
      select: {
        autoUnlockError: true,
        autoUnlockProcessedAt: true,
        creditsGranted: true,
        originAction: true,
        status: true,
      },
    });
    const refreshedAdaptation = await database.cvAdaptation.findUnique({
      where: { id: adaptation.id },
      select: { isUnlocked: true },
    });

    assert.equal(
      refreshedUser?.creditsRemaining,
      1,
      `creditsRemaining expected 1, got ${String(refreshedUser?.creditsRemaining)}`,
    );
    assert.equal(
      refreshedPurchase?.status,
      "completed",
      `purchase status expected completed, got ${String(refreshedPurchase?.status)}`,
    );
    assert.equal(
      refreshedPurchase?.originAction,
      "unlock_cv",
      `originAction expected unlock_cv, got ${String(refreshedPurchase?.originAction)}`,
    );
    assert.equal(
      refreshedPurchase?.creditsGranted,
      1,
      `creditsGranted expected 1, got ${String(refreshedPurchase?.creditsGranted)}`,
    );
    assert.equal(
      refreshedAdaptation?.isUnlocked,
      true,
      `adaptationUnlocked expected true, got ${String(refreshedAdaptation?.isUnlocked)}`,
    );
    assert.equal(
      refreshedPurchase?.autoUnlockError,
      null,
      `autoUnlockError expected null, got ${String(refreshedPurchase?.autoUnlockError)}`,
    );
    assert.ok(
      refreshedPurchase?.autoUnlockProcessedAt,
      `autoUnlockProcessedAt expected present, got ${String(refreshedPurchase?.autoUnlockProcessedAt)}`,
    );
    assert.equal(
      unlockCount,
      0,
      `unlockCount expected 0, got ${String(unlockCount)}`,
    );
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("ownership mismatch records autoUnlockError and preserves purchased credits", async () => {
  const { app, database } = await createApp();
  const buyer = await registerUser(app, database, "p-mismatch-buyer");
  const owner = await registerUser(app, database, "p-mismatch-owner");
  try {
    const ownerResume = await database.resume.create({
      data: {
        userId: owner.userId,
        title: "CV Master",
        kind: "master",
        status: "uploaded",
        rawText: "Resumo profissional",
      },
    });

    const adaptation = await database.cvAdaptation.create({
      data: {
        userId: owner.userId,
        masterResumeId: ownerResume.id,
        jobDescriptionText: "Descricao da vaga",
        status: "awaiting_payment",
        paymentStatus: "none",
        adaptedContentJson: {
          vaga: { cargo: "Data" },
        } as Prisma.InputJsonValue,
      },
    });

    const paymentReference = randomUUID();
    const purchase = await database.planPurchase.create({
      data: {
        userId: buyer.userId,
        planType: "starter",
        amountInCents: 1190,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        status: "pending",
        creditsGranted: 1,
        analysisCreditsGranted: 6,
        originAction: "unlock_cv",
        originAdaptationId: adaptation.id,
      },
    });

    await markPurchaseAsApproved(app, paymentReference);

    const refreshedBuyer = await database.user.findUnique({
      where: { id: buyer.userId },
      select: { creditsRemaining: true },
    });
    assert.equal(refreshedBuyer?.creditsRemaining, 1);

    const refreshedAdaptation = await database.cvAdaptation.findUnique({
      where: { id: adaptation.id },
      select: { isUnlocked: true },
    });
    assert.equal(refreshedAdaptation?.isUnlocked, false);

    const refreshedPurchase = await database.planPurchase.findUnique({
      where: { id: purchase.id },
      select: { autoUnlockError: true },
    });
    assert.match(
      String(refreshedPurchase?.autoUnlockError),
      /ownership mismatch/i,
    );
  } finally {
    await deleteUserByEmail(database, buyer.email);
    await deleteUserByEmail(database, owner.email);
    await app.close();
  }
});

test("missing adapted content records autoUnlockError and preserves purchased credits", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-unlock-no-content");
  try {
    const masterResume = await database.resume.create({
      data: {
        userId: user.userId,
        title: "CV Master",
        kind: "master",
        status: "uploaded",
        rawText: "Resumo profissional",
      },
    });

    const adaptation = await database.cvAdaptation.create({
      data: {
        userId: user.userId,
        masterResumeId: masterResume.id,
        jobDescriptionText: "Descricao da vaga",
        status: "awaiting_payment",
        paymentStatus: "none",
      },
    });

    const paymentReference = randomUUID();
    const purchase = await database.planPurchase.create({
      data: {
        userId: user.userId,
        planType: "starter",
        amountInCents: 1190,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        status: "pending",
        creditsGranted: 1,
        analysisCreditsGranted: 6,
        originAction: "unlock_cv",
        originAdaptationId: adaptation.id,
      },
    });

    await markPurchaseAsApproved(app, paymentReference);

    const refreshedUser = await database.user.findUnique({
      where: { id: user.userId },
      select: { creditsRemaining: true },
    });
    assert.equal(refreshedUser?.creditsRemaining, 1);

    const refreshedAdaptation = await database.cvAdaptation.findUnique({
      where: { id: adaptation.id },
      select: { isUnlocked: true },
    });
    assert.equal(refreshedAdaptation?.isUnlocked, false);

    const refreshedPurchase = await database.planPurchase.findUnique({
      where: { id: purchase.id },
      select: { autoUnlockError: true },
    });
    assert.match(
      String(refreshedPurchase?.autoUnlockError),
      /no adapted content/i,
    );
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});
