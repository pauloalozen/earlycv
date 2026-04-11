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
      password: "Super-secret-123",
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

test("admin profile endpoints list, fetch, and update product user profiles", async () => {
  const { app, database } = await createApp();
  const admin = await registerUser(app, database, "admin-profile-admin");
  const productUser = await registerUser(
    app,
    database,
    "admin-profile-product",
  );
  const staffUser = await registerUser(app, database, "admin-profile-staff");

  await promoteToInternalAdmin(database, admin.userId, "superadmin");
  await database.user.update({
    where: { id: staffUser.userId },
    data: {
      isStaff: true,
      internalRole: "admin",
    },
  });
  await database.userProfile.update({
    where: { userId: productUser.userId },
    data: {
      headline: "Platform Engineer",
      city: "Recife",
      country: "Brazil",
      summary: "Builds internal tooling.",
    },
  });
  await database.userProfile.update({
    where: { userId: staffUser.userId },
    data: {
      headline: "Staff Profile",
    },
  });

  await request(app.getHttpServer())
    .get("/api/admin/profiles")
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(Array.isArray(body), true);

      const listedProfile = body.find(
        (profile: { userId: string }) => profile.userId === productUser.userId,
      ) as Record<string, unknown> | undefined;

      assert.ok(listedProfile);
      assert.equal(listedProfile.headline, "Platform Engineer");
      assert.equal(listedProfile.city, "Recife");
      assert.equal(
        body.some(
          (profile: { userId: string }) => profile.userId === staffUser.userId,
        ),
        false,
      );
    });

  await request(app.getHttpServer())
    .get(`/api/admin/profiles/${productUser.userId}`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.userId, productUser.userId);
      assert.equal(body.headline, "Platform Engineer");
      assert.equal(body.summary, "Builds internal tooling.");
    });

  await request(app.getHttpServer())
    .patch(`/api/admin/profiles/${productUser.userId}`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({
      headline: "Principal Platform Engineer",
      city: "Sao Paulo",
      preferredLanguage: "en",
    })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.userId, productUser.userId);
      assert.equal(body.headline, "Principal Platform Engineer");
      assert.equal(body.city, "Sao Paulo");
      assert.equal(body.preferredLanguage, "en");
    });

  await request(app.getHttpServer())
    .patch(`/api/admin/profiles/${staffUser.userId}`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({ headline: "Should Fail" })
    .expect(404);

  const refreshedProfile = await database.userProfile.findUnique({
    where: { userId: productUser.userId },
  });

  assert.equal(refreshedProfile?.headline, "Principal Platform Engineer");
  assert.equal(refreshedProfile?.city, "Sao Paulo");
  assert.equal(refreshedProfile?.preferredLanguage, "en");

  await deleteUserByEmail(database, admin.email);
  await deleteUserByEmail(database, productUser.email);
  await deleteUserByEmail(database, staffUser.email);
  await app.close();
});
