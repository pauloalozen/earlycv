import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";
import { InternalTestModule } from "./internal-test.module";

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
};

type UserDelegate = DeleteManyDelegate & {
  updateMany: (args?: unknown) => Promise<unknown>;
};

async function deleteUserByEmail(database: DatabaseService, email: string) {
  await (database.user as UserDelegate).deleteMany({
    where: { email },
  });
}

async function updateUserRole(
  database: DatabaseService,
  email: string,
  input: { internalRole: "admin" | "superadmin"; isStaff: boolean },
) {
  await (database.user as UserDelegate).updateMany({
    where: { email },
    data: input,
  });
}

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, InternalTestModule],
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

test("POST /api/auth/login returns access and refresh tokens for valid credentials", async () => {
  const { app, database } = await createApp();
  const email = `ana+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  await request(app.getHttpServer()).post("/api/auth/register").send({
    email,
    password: "super-secret-123",
    name: "Ana Silva",
  });

  await request(app.getHttpServer())
    .post("/api/auth/login")
    .send({ email, password: "super-secret-123" })
    .expect(201)
    .expect(({ body }) => {
      assert.equal(typeof body.accessToken, "string");
      assert.equal(typeof body.refreshToken, "string");
      assert.equal(body.user.email, email);
      assert.equal(body.user.isStaff, false);
      assert.equal(body.user.internalRole, "none");
      assert.equal("passwordHash" in body.user, false);
    });

  await deleteUserByEmail(database, email);
  await app.close();
});

test("auth endpoints validate payloads, rotate refresh tokens, logout, and return the current user", async () => {
  const { app, database } = await createApp();
  const email = `leo+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({ email, password: "short", name: "Leo" })
    .expect(400);

  await request(app.getHttpServer())
    .post("/api/auth/login")
    .send({ email: "not-an-email", password: "short" })
    .expect(400);

  const registerResponse = await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({
      email,
      password: "super-secret-123",
      name: "Leo Costa",
    })
    .expect(201);

  const accessToken = registerResponse.body.accessToken as string;
  const refreshToken = registerResponse.body.refreshToken as string;

  await request(app.getHttpServer())
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.email, email);
      assert.equal(body.name, "Leo Costa");
      assert.equal(body.isStaff, false);
      assert.equal(body.internalRole, "none");
      assert.equal("passwordHash" in body, false);
    });

  const refreshResponse = await request(app.getHttpServer())
    .post("/api/auth/refresh")
    .send({ refreshToken })
    .expect(201);

  assert.equal(typeof refreshResponse.body.accessToken, "string");
  assert.equal(typeof refreshResponse.body.refreshToken, "string");
  assert.notEqual(refreshResponse.body.refreshToken, refreshToken);

  await request(app.getHttpServer())
    .post("/api/auth/logout")
    .send({ refreshToken: refreshResponse.body.refreshToken })
    .expect(201)
    .expect(({ body }) => {
      assert.deepEqual(body, { ok: true });
    });

  await request(app.getHttpServer())
    .post("/api/auth/refresh")
    .send({ refreshToken: refreshResponse.body.refreshToken })
    .expect(401);

  await deleteUserByEmail(database, email);
  await app.close();
});

test("admin-only endpoint rejects users without an internal role", async () => {
  const { app, database } = await createApp();
  const email = `mila+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const registerResponse = await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({
      email,
      password: "super-secret-123",
      name: "Mila Rocha",
    })
    .expect(201);

  await request(app.getHttpServer())
    .get("/api/internal-test/admin-check")
    .set(
      "Authorization",
      `Bearer ${registerResponse.body.accessToken as string}`,
    )
    .expect(403);

  await deleteUserByEmail(database, email);
  await app.close();
});

test("admin-only endpoint returns 401 without a bearer token", async () => {
  const { app } = await createApp();

  await request(app.getHttpServer())
    .get("/api/internal-test/admin-check")
    .expect(401);

  await app.close();
});

test("admin-only endpoint rejects admin-role users without staff access", async () => {
  const { app, database } = await createApp();
  const email = `nina+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const registerResponse = await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({
      email,
      password: "super-secret-123",
      name: "Nina Costa",
    })
    .expect(201);

  await updateUserRole(database, email, {
    internalRole: "admin",
    isStaff: false,
  });

  await request(app.getHttpServer())
    .get("/api/internal-test/admin-check")
    .set(
      "Authorization",
      `Bearer ${registerResponse.body.accessToken as string}`,
    )
    .expect(403);

  await deleteUserByEmail(database, email);
  await app.close();
});

test("admin-only endpoint allows staff admins", async () => {
  const { app, database } = await createApp();
  const email = `caio+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const registerResponse = await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({
      email,
      password: "super-secret-123",
      name: "Caio Lima",
    })
    .expect(201);

  await updateUserRole(database, email, {
    internalRole: "admin",
    isStaff: true,
  });

  await request(app.getHttpServer())
    .get("/api/internal-test/admin-check")
    .set(
      "Authorization",
      `Bearer ${registerResponse.body.accessToken as string}`,
    )
    .expect(200)
    .expect(({ body }) => {
      assert.deepEqual(body, { ok: true });
    });

  await deleteUserByEmail(database, email);
  await app.close();
});

test("admin-only endpoint allows staff superadmins", async () => {
  const { app, database } = await createApp();
  const email = `lia+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const registerResponse = await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({
      email,
      password: "super-secret-123",
      name: "Lia Martins",
    })
    .expect(201);

  await updateUserRole(database, email, {
    internalRole: "superadmin",
    isStaff: true,
  });

  await request(app.getHttpServer())
    .get("/api/internal-test/admin-check")
    .set(
      "Authorization",
      `Bearer ${registerResponse.body.accessToken as string}`,
    )
    .expect(200)
    .expect(({ body }) => {
      assert.deepEqual(body, { ok: true });
    });

  await deleteUserByEmail(database, email);
  await app.close();
});
