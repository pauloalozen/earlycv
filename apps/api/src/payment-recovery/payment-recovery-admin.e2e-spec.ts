import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";
import { PaymentRecoveryEligibilityService } from "./payment-recovery-eligibility.service";
import { PaymentRecoveryEmailService } from "./payment-recovery-email.service";

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
};

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PaymentRecoveryEligibilityService)
    .useValue({
      listPending: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      }),
    })
    .overrideProvider(PaymentRecoveryEmailService)
    .useValue({
      send: async () => ({
        success: true,
        status: "skipped",
        reason: "email_disabled",
        dryRun: true,
        allowlistMatched: false,
        realEmailSent: false,
        emailRecordId: "email-1",
        tokenExpiresAt: new Date().toISOString(),
        eligibilityStatus: "eligible",
        eligibilityReason: "pending_unlock_cv_not_unlocked",
      }),
    })
    .compile();

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
) {
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
    userId: response.body.user.id as string,
    email,
  };
}

test("payment recovery admin pending route denies common user and allows admin", async () => {
  const previousAdminEnabled = process.env.ADMIN_PAYMENT_RECOVERY_ENABLED;
  process.env.ADMIN_PAYMENT_RECOVERY_ENABLED = "true";

  const { app, database } = await createApp();
  try {
    const commonUser = await registerUser(app, database, "pr-common");
    const adminUser = await registerUser(app, database, "pr-admin");

    await database.user.update({
      where: { id: adminUser.userId },
      data: { isStaff: true, internalRole: "admin" },
    });

    await request(app.getHttpServer())
      .get("/api/admin/payment-recovery/pending")
      .set("Authorization", `Bearer ${commonUser.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get("/api/admin/payment-recovery/pending")
      .set("Authorization", `Bearer ${adminUser.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        assert.equal(Array.isArray(body.items), true);
        assert.equal(typeof body.total, "number");
        assert.equal(body.page, 1);
        assert.equal(body.pageSize, 20);
      });

    await deleteUserByEmail(database, commonUser.email);
    await deleteUserByEmail(database, adminUser.email);
  } finally {
    await app.close();
    if (previousAdminEnabled === undefined) {
      delete process.env.ADMIN_PAYMENT_RECOVERY_ENABLED;
    } else {
      process.env.ADMIN_PAYMENT_RECOVERY_ENABLED = previousAdminEnabled;
    }
  }
});

test("payment recovery admin pending route accepts whitelisted query filters", async () => {
  const previousAdminEnabled = process.env.ADMIN_PAYMENT_RECOVERY_ENABLED;
  process.env.ADMIN_PAYMENT_RECOVERY_ENABLED = "true";

  const { app, database } = await createApp();
  try {
    const adminUser = await registerUser(app, database, "pr-admin-filters");

    await database.user.update({
      where: { id: adminUser.userId },
      data: { isStaff: true, internalRole: "admin" },
    });

    await request(app.getHttpServer())
      .get("/api/admin/payment-recovery/pending")
      .query({
        eligibilityStatus: "eligible",
        ignored: "false",
        page: "1",
        pageSize: "20",
      })
      .set("Authorization", `Bearer ${adminUser.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        assert.equal(Array.isArray(body.items), true);
        assert.equal(body.page, 1);
        assert.equal(body.pageSize, 20);
      });

    await deleteUserByEmail(database, adminUser.email);
  } finally {
    await app.close();
    if (previousAdminEnabled === undefined) {
      delete process.env.ADMIN_PAYMENT_RECOVERY_ENABLED;
    } else {
      process.env.ADMIN_PAYMENT_RECOVERY_ENABLED = previousAdminEnabled;
    }
  }
});

test("payment recovery admin pending route is fail-closed when feature disabled", async () => {
  const previousAdminEnabled = process.env.ADMIN_PAYMENT_RECOVERY_ENABLED;
  process.env.ADMIN_PAYMENT_RECOVERY_ENABLED = "false";

  const { app, database } = await createApp();
  try {
    const adminUser = await registerUser(app, database, "pr-admin-off");

    await database.user.update({
      where: { id: adminUser.userId },
      data: { isStaff: true, internalRole: "admin" },
    });

    const response = await request(app.getHttpServer())
      .get("/api/admin/payment-recovery/pending")
      .set("Authorization", `Bearer ${adminUser.accessToken}`);

    assert.equal(response.status, 403);

    await deleteUserByEmail(database, adminUser.email);
  } finally {
    await app.close();
    if (previousAdminEnabled === undefined) {
      delete process.env.ADMIN_PAYMENT_RECOVERY_ENABLED;
    } else {
      process.env.ADMIN_PAYMENT_RECOVERY_ENABLED = previousAdminEnabled;
    }
  }
});

test("payment recovery admin send-email denies common user and allows admin", async () => {
  const previousAdminEnabled = process.env.ADMIN_PAYMENT_RECOVERY_ENABLED;
  process.env.ADMIN_PAYMENT_RECOVERY_ENABLED = "true";

  const { app, database } = await createApp();
  try {
    const commonUser = await registerUser(app, database, "pr-common-send");
    const adminUser = await registerUser(app, database, "pr-admin-send");
    await database.user.update({
      where: { id: adminUser.userId },
      data: { isStaff: true, internalRole: "admin" },
    });

    await request(app.getHttpServer())
      .post("/api/admin/payment-recovery/purchase-1/send-email")
      .set("Authorization", `Bearer ${commonUser.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post("/api/admin/payment-recovery/purchase-1/send-email")
      .set("Authorization", `Bearer ${adminUser.accessToken}`)
      .expect(201)
      .expect(({ body }) => {
        assert.equal(body.success, true);
        assert.equal(body.status, "skipped");
        assert.equal(typeof body.reason, "string");
        assert.equal(typeof body.dryRun, "boolean");
        assert.equal(typeof body.allowlistMatched, "boolean");
        assert.equal(typeof body.realEmailSent, "boolean");
        assert.equal(typeof body.emailRecordId, "string");
        assert.equal(typeof body.tokenExpiresAt, "string");
      });

    await deleteUserByEmail(database, commonUser.email);
    await deleteUserByEmail(database, adminUser.email);
  } finally {
    await app.close();
    if (previousAdminEnabled === undefined) {
      delete process.env.ADMIN_PAYMENT_RECOVERY_ENABLED;
    } else {
      process.env.ADMIN_PAYMENT_RECOVERY_ENABLED = previousAdminEnabled;
    }
  }
});
