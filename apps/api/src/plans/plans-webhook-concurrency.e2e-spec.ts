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

type MockedResolution = {
  paymentReference: string | null;
  paymentId?: string | null;
  status: "approved" | "failed" | "refunded" | "pending" | "unknown";
  rawStatus?: string | null;
  paidAmountInCents?: number | null;
  paidCurrency?: string | null;
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

function withMockedResolution(
  app: INestApplication,
  resolution: MockedResolution,
) {
  const plansService = app.get(PlansService) as unknown as {
    handleWebhook: (provider: string, body: unknown) => Promise<void>;
    resolveMercadoPagoPayment: (body: unknown) => Promise<MockedResolution>;
  };
  const originalResolve = plansService.resolveMercadoPagoPayment;
  plansService.resolveMercadoPagoPayment = async () => resolution;
  return {
    plansService,
    restore: () => {
      plansService.resolveMercadoPagoPayment = originalResolve;
    },
  };
}

test("two concurrent approved webhooks for the same purchase credit only once", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-webhook-race");
  try {
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
        analysisCreditsGranted: 0,
        originAction: "buy_credits",
      },
    });

    const { plansService, restore } = withMockedResolution(app, {
      paymentReference,
      status: "approved",
      paidAmountInCents: 1190,
      paidCurrency: "BRL",
    });

    try {
      // Duas notificações "simultâneas" reais — ambas batem no Postgres de
      // teste em paralelo via Promise.all, não uma chamada sequencial.
      await Promise.all([
        plansService.handleWebhook("mercadopago", {
          type: "payment",
          data: { id: "race-1" },
        }),
        plansService.handleWebhook("mercadopago", {
          type: "payment",
          data: { id: "race-2" },
        }),
      ]);
    } finally {
      restore();
    }

    const refreshedUser = await database.user.findUnique({
      where: { id: user.userId },
      select: { creditsRemaining: true },
    });
    assert.equal(refreshedUser?.creditsRemaining, 3);

    const purchase = await database.planPurchase.findUnique({
      where: { paymentReference },
      select: { status: true },
    });
    assert.equal(purchase?.status, "completed");
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("two concurrent refund webhooks for the same completed purchase reverse only once", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-refund-race");
  try {
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
        analysisCreditsGranted: 0,
        originAction: "buy_credits",
      },
    });

    {
      const { plansService, restore } = withMockedResolution(app, {
        paymentReference,
        status: "approved",
        paidAmountInCents: 1190,
        paidCurrency: "BRL",
      });
      try {
        await plansService.handleWebhook("mercadopago", {
          type: "payment",
          data: { id: "approve-1" },
        });
      } finally {
        restore();
      }
    }

    const afterApproval = await database.user.findUnique({
      where: { id: user.userId },
      select: { creditsRemaining: true },
    });
    assert.equal(afterApproval?.creditsRemaining, 3);

    const { plansService, restore } = withMockedResolution(app, {
      paymentReference,
      status: "refunded",
      rawStatus: "refunded",
    });

    try {
      await Promise.all([
        plansService.handleWebhook("mercadopago", {
          type: "payment",
          data: { id: "refund-1" },
        }),
        plansService.handleWebhook("mercadopago", {
          type: "payment",
          data: { id: "refund-2" },
        }),
      ]);
    } finally {
      restore();
    }

    const refreshedUser = await database.user.findUnique({
      where: { id: user.userId },
      select: { creditsRemaining: true },
    });
    // Reversão aplicada uma única vez: 3 -> 0, nunca -3.
    assert.equal(refreshedUser?.creditsRemaining, 0);

    const purchase = await database.planPurchase.findUnique({
      where: { paymentReference },
      select: {
        status: true,
        creditReversalAppliedAmount: true,
        creditReversalShortfall: true,
      },
    });
    assert.equal(purchase?.status, "refunded");
    assert.equal(purchase?.creditReversalAppliedAmount, 3);
    assert.equal(purchase?.creditReversalShortfall, 0);
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("refund with already-consumed credits reverses only what's available and records the shortfall", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-refund-shortfall");
  try {
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
        creditsGranted: 5,
        analysisCreditsGranted: 0,
        originAction: "buy_credits",
      },
    });

    {
      const { plansService, restore } = withMockedResolution(app, {
        paymentReference,
        status: "approved",
        paidAmountInCents: 1190,
        paidCurrency: "BRL",
      });
      try {
        await plansService.handleWebhook("mercadopago", {
          type: "payment",
          data: { id: "approve-shortfall-1" },
        });
      } finally {
        restore();
      }
    }

    // Simula consumo de créditos (de qualquer origem, pool único) antes do
    // estorno chegar: usuário tinha 5, sobrou só 2.
    await database.user.update({
      where: { id: user.userId },
      data: { creditsRemaining: 2 },
    });

    const { plansService, restore } = withMockedResolution(app, {
      paymentReference,
      status: "refunded",
      rawStatus: "refunded",
    });

    try {
      await plansService.handleWebhook("mercadopago", {
        type: "payment",
        data: { id: "refund-shortfall-1" },
      });
    } finally {
      restore();
    }

    const refreshedUser = await database.user.findUnique({
      where: { id: user.userId },
      select: { creditsRemaining: true },
    });
    // Nunca fica negativo: reverte só o que existia (2), nunca os 5 gerados.
    assert.equal(refreshedUser?.creditsRemaining, 0);

    const purchase = await database.planPurchase.findUnique({
      where: { paymentReference },
      select: {
        status: true,
        creditReversalAppliedAmount: true,
        creditReversalShortfall: true,
      },
    });
    assert.equal(purchase?.status, "refunded");
    assert.equal(purchase?.creditReversalAppliedAmount, 2);
    assert.equal(purchase?.creditReversalShortfall, 3);
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("approved webhook with a paid amount that diverges from the order does not credit", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-amount-mismatch");
  try {
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
        analysisCreditsGranted: 0,
        originAction: "buy_credits",
      },
    });

    const { plansService, restore } = withMockedResolution(app, {
      paymentReference,
      status: "approved",
      paidAmountInCents: 100, // divergente do amountInCents (1190) do pedido
      paidCurrency: "BRL",
    });

    try {
      await plansService.handleWebhook("mercadopago", {
        type: "payment",
        data: { id: "mismatch-1" },
      });
    } finally {
      restore();
    }

    const refreshedUser = await database.user.findUnique({
      where: { id: user.userId },
      select: { creditsRemaining: true },
    });
    assert.equal(refreshedUser?.creditsRemaining, 0);

    const purchase = await database.planPurchase.findUnique({
      where: { paymentReference },
      select: { status: true },
    });
    assert.equal(purchase?.status, "pending");

    // logAuditEvent é fire-and-forget (não bloqueia a resposta do
    // webhook) — poll curto em vez de leitura única, já que a escrita
    // pode não ter comitado ainda no instante exato após o await acima.
    let auditLog: { eventType: string } | null = null;
    for (let attempt = 0; attempt < 20 && !auditLog; attempt += 1) {
      auditLog = await database.paymentAuditLog.findFirst({
        where: { externalReference: paymentReference },
        orderBy: { createdAt: "desc" },
      });
      if (!auditLog) await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(auditLog?.eventType, "payment_amount_mismatch");
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});
