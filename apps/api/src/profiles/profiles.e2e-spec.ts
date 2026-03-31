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

test("GET /api/users/profile returns only the authenticated user's profile", async () => {
  const { app, database } = await createApp();
  const firstUser = await registerUser(app, database, "profile-one");
  const secondUser = await registerUser(app, database, "profile-two");

  await database.userProfile.update({
    where: { userId: firstUser.userId },
    data: {
      headline: "Analytics Engineer",
      city: "Sao Paulo",
    },
  });
  await database.userProfile.update({
    where: { userId: secondUser.userId },
    data: {
      headline: "Product Manager",
      city: "Rio de Janeiro",
    },
  });

  await request(app.getHttpServer())
    .get("/api/users/profile")
    .set("Authorization", `Bearer ${firstUser.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.userId, firstUser.userId);
      assert.equal(body.headline, "Analytics Engineer");
      assert.equal(body.city, "Sao Paulo");
      assert.equal(body.headline === "Product Manager", false);
    });

  await deleteUserByEmail(database, firstUser.email);
  await deleteUserByEmail(database, secondUser.email);
  await app.close();
});

test("PUT /api/users/profile updates only the authenticated user's profile", async () => {
  const { app, database } = await createApp();
  const firstUser = await registerUser(app, database, "profile-update-one");
  const secondUser = await registerUser(app, database, "profile-update-two");

  await database.userProfile.update({
    where: { userId: secondUser.userId },
    data: {
      headline: "Original Headline",
    },
  });

  await request(app.getHttpServer())
    .put("/api/users/profile")
    .set("Authorization", `Bearer ${firstUser.accessToken}`)
    .send({
      headline: "Senior Data Analyst",
      summary: "Focus on experimentation and BI.",
      preferredLanguage: "pt-BR",
    })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.userId, firstUser.userId);
      assert.equal(body.headline, "Senior Data Analyst");
      assert.equal(body.summary, "Focus on experimentation and BI.");
      assert.equal(body.preferredLanguage, "pt-BR");
    });

  const ownProfile = await database.userProfile.findUnique({
    where: { userId: firstUser.userId },
  });
  const otherProfile = await database.userProfile.findUnique({
    where: { userId: secondUser.userId },
  });

  assert.equal(ownProfile?.headline, "Senior Data Analyst");
  assert.equal(ownProfile?.summary, "Focus on experimentation and BI.");
  assert.equal(otherProfile?.headline, "Original Headline");

  await deleteUserByEmail(database, firstUser.email);
  await deleteUserByEmail(database, secondUser.email);
  await app.close();
});
