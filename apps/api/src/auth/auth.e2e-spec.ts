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

type UserDeleteDelegate = DeleteManyDelegate;

async function deleteUserByEmail(database: DatabaseService, email: string) {
  await (database.user as UserDeleteDelegate).deleteMany({
    where: { email },
  });
}

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
