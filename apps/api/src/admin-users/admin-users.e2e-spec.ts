import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
};

type RegisterResult = {
  accessToken: string;
  email: string;
  userId: string;
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

  return {
    app,
    database: app.get(DatabaseService),
  };
}

async function deleteUserByEmail(database: DatabaseService, email: string) {
  await (database.user as DeleteManyDelegate).deleteMany({
    where: { email },
  });
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
      password: "super-secret-123",
      name: `${prefix} User`,
    })
    .expect(201);

  return {
    accessToken: response.body.accessToken as string,
    email,
    userId: response.body.user.id as string,
  };
}

async function promoteToInternalAdmin(
  database: DatabaseService,
  userId: string,
  internalRole: "admin" | "superadmin" = "admin",
) {
  await database.user.update({
    where: { id: userId },
    data: {
      isStaff: true,
      internalRole,
    },
  });
}

test("GET /api/admin/users lists product users and returns detail with ordered resumes and profile summary", async () => {
  const { app, database } = await createApp();
  const admin = await registerUser(app, database, "admin-users-admin");
  const productUser = await registerUser(app, database, "admin-users-product");
  const staffUser = await registerUser(app, database, "admin-users-staff");

  await promoteToInternalAdmin(database, admin.userId);
  await database.user.update({
    where: { id: staffUser.userId },
    data: {
      isStaff: true,
      internalRole: "admin",
      name: "Staff Member",
    },
  });
  await database.user.update({
    where: { id: productUser.userId },
    data: {
      name: "Product User",
      status: "suspended",
    },
  });
  await database.userProfile.update({
    where: { userId: productUser.userId },
    data: {
      headline: "Senior Backend Engineer",
      city: "Sao Paulo",
      country: "Brazil",
    },
  });
  const olderResume = await database.resume.create({
    data: {
      userId: productUser.userId,
      title: "Resume One",
      status: "uploaded",
      kind: "master",
      isMaster: true,
    },
  });
  const newerResume = await database.resume.create({
    data: {
      userId: productUser.userId,
      title: "Resume Two",
      status: "reviewed",
      kind: "adapted",
      isMaster: false,
    },
  });

  await request(app.getHttpServer())
    .get("/api/admin/users")
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(Array.isArray(body), true);
      assert.equal(
        body.some((user: { id: string }) => user.id === staffUser.userId),
        false,
      );

      const listedUser = body.find(
        (user: { id: string }) => user.id === productUser.userId,
      ) as Record<string, unknown> | undefined;

      assert.ok(listedUser);
      assert.equal(listedUser.name, "Product User");
      assert.equal(listedUser.isStaff, false);
      assert.equal(listedUser.status, "suspended");
      assert.deepEqual(listedUser.profile, {
        headline: "Senior Backend Engineer",
        city: "Sao Paulo",
        country: "Brazil",
      });
      assert.deepEqual(listedUser.resumes, [
        {
          id: newerResume.id,
          title: "Resume Two",
          status: "reviewed",
          kind: "adapted",
          isMaster: false,
        },
        {
          id: olderResume.id,
          title: "Resume One",
          status: "uploaded",
          kind: "master",
          isMaster: true,
        },
      ]);
      assert.equal("resumeSummary" in listedUser, false);
    });

  await request(app.getHttpServer())
    .get(`/api/admin/users/${productUser.userId}`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.id, productUser.userId);
      assert.equal(body.email, productUser.email);
      assert.equal(body.name, "Product User");
      assert.equal(body.isStaff, false);
      assert.equal(body.profile.headline, "Senior Backend Engineer");
      assert.deepEqual(body.resumes, [
        {
          id: newerResume.id,
          title: "Resume Two",
          status: "reviewed",
          kind: "adapted",
          isMaster: false,
        },
        {
          id: olderResume.id,
          title: "Resume One",
          status: "uploaded",
          kind: "master",
          isMaster: true,
        },
      ]);
      assert.equal("resumeSummary" in body, false);
    });

  await deleteUserByEmail(database, admin.email);
  await deleteUserByEmail(database, productUser.email);
  await deleteUserByEmail(database, staffUser.email);
  await app.close();
});

test("PATCH /api/admin/users routes update base fields, plan, and status for product users", async () => {
  const { app, database } = await createApp();
  const admin = await registerUser(app, database, "admin-users-admin-update");
  const productUser = await registerUser(
    app,
    database,
    "admin-users-product-update",
  );
  const staffUser = await registerUser(
    app,
    database,
    "admin-users-staff-update",
  );
  const verifiedAt = new Date("2026-04-01T12:00:00.000Z");
  const updatedProductEmail = `renamed+${randomUUID()}@earlycv.dev`;

  await promoteToInternalAdmin(database, admin.userId, "superadmin");
  await database.user.update({
    where: { id: staffUser.userId },
    data: {
      isStaff: true,
      internalRole: "admin",
    },
  });
  await database.user.update({
    where: { id: productUser.userId },
    data: {
      emailVerifiedAt: verifiedAt,
    },
  });

  await request(app.getHttpServer())
    .patch(`/api/admin/users/${productUser.userId}`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({
      email: updatedProductEmail,
      name: "Updated Product User",
    })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.name, "Updated Product User");
      assert.equal(body.email, updatedProductEmail);
      assert.equal(body.isStaff, false);
      assert.equal(body.emailVerifiedAt, null);
    });

  const credentialsAccount = await database.authAccount.findFirst({
    where: {
      userId: productUser.userId,
      provider: "credentials",
    },
  });

  assert.equal(credentialsAccount?.providerAccountId, updatedProductEmail);
  assert.equal(credentialsAccount?.providerEmail, updatedProductEmail);

  const replacementResponse = await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({
      email: productUser.email,
      password: "super-secret-123",
      name: "Replacement Product User",
    })
    .expect(201);

  const replacementUserId = replacementResponse.body.user.id as string;

  const replacementCredentialsAccount = await database.authAccount.findFirst({
    where: {
      userId: replacementUserId,
      provider: "credentials",
    },
  });

  assert.equal(
    replacementCredentialsAccount?.providerAccountId,
    productUser.email,
  );
  assert.equal(replacementCredentialsAccount?.providerEmail, productUser.email);

  await request(app.getHttpServer())
    .patch(`/api/admin/users/${productUser.userId}/plan`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({ planType: "free" })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.planType, "free");
      assert.equal(body.id, productUser.userId);
    });

  await request(app.getHttpServer())
    .patch(`/api/admin/users/${productUser.userId}/status`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({ status: "active" })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.status, "active");
      assert.equal(body.id, productUser.userId);
    });

  await request(app.getHttpServer())
    .patch(`/api/admin/users/${staffUser.userId}/status`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({ status: "deleted" })
    .expect(404);

  const refreshedUser = await database.user.findUnique({
    where: { id: productUser.userId },
  });

  assert.equal(refreshedUser?.name, "Updated Product User");
  assert.equal(refreshedUser?.planType, "free");
  assert.equal(refreshedUser?.status, "active");
  assert.equal(refreshedUser?.emailVerifiedAt, null);

  await deleteUserByEmail(database, admin.email);
  await deleteUserByEmail(database, refreshedUser?.email ?? productUser.email);
  await deleteUserByEmail(database, staffUser.email);
  await deleteUserByEmail(database, productUser.email);
  await app.close();
});

test("POST /api/admin/users/:id/assisted-session starts an assisted inspection session with explicit metadata", async () => {
  const { app, database } = await createApp();
  const admin = await registerUser(app, database, "admin-assisted");
  const productUser = await registerUser(app, database, "product-assisted");

  await promoteToInternalAdmin(database, admin.userId, "admin");

  await request(app.getHttpServer())
    .post(`/api/admin/users/${productUser.userId}/assisted-session`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({
      reason: "Investigating onboarding issue",
    })
    .expect(201)
    .expect(({ body }) => {
      assert.deepEqual(body, {
        mode: "assisted",
        operatorUserId: admin.userId,
        targetUserId: productUser.userId,
        reason: "Investigating onboarding issue",
        banner: "Sessao assistida ativa",
      });
    });

  await deleteUserByEmail(database, admin.email);
  await deleteUserByEmail(database, productUser.email);
  await app.close();
});

test("POST /api/admin/users/:id/assisted-session rejects invalid payloads and invalid targets", async () => {
  const { app, database } = await createApp();
  const admin = await registerUser(app, database, "admin-assisted-hardening");
  const productUser = await registerUser(
    app,
    database,
    "product-assisted-hardening",
  );
  const staffUser = await registerUser(
    app,
    database,
    "staff-assisted-hardening",
  );

  await promoteToInternalAdmin(database, admin.userId, "admin");
  await promoteToInternalAdmin(database, staffUser.userId, "superadmin");

  await request(app.getHttpServer())
    .post(`/api/admin/users/${productUser.userId}/assisted-session`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({ reason: "  " })
    .expect(400);

  await request(app.getHttpServer())
    .post(`/api/admin/users/${productUser.userId}/assisted-session`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({ reason: "ok", extra: true })
    .expect(400);

  await request(app.getHttpServer())
    .post(`/api/admin/users/${staffUser.userId}/assisted-session`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({ reason: "Investigating staff account misuse" })
    .expect(404);

  await request(app.getHttpServer())
    .post("/api/admin/users/user_missing/assisted-session")
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({ reason: "Investigating missing account" })
    .expect(404);

  await deleteUserByEmail(database, admin.email);
  await deleteUserByEmail(database, productUser.email);
  await deleteUserByEmail(database, staffUser.email);
  await app.close();
});
