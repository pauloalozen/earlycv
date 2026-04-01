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
  internalRole: "admin" | "superadmin",
) {
  await database.user.update({
    where: { id: userId },
    data: {
      isStaff: true,
      internalRole,
    },
  });
}

test("only superadmin can create, list, update, and change roles for staff accounts", async () => {
  const { app, database } = await createApp();
  const superadmin = await registerUser(app, database, "superadmin-staff-root");
  const admin = await registerUser(app, database, "superadmin-staff-admin");
  const staffEmail = `staff+${randomUUID()}@earlycv.dev`;
  const updatedStaffEmail = `updated-staff+${randomUUID()}@earlycv.dev`;
  const replacementStaffEmail = staffEmail;

  await promoteToInternalAdmin(database, superadmin.userId, "superadmin");
  await promoteToInternalAdmin(database, admin.userId, "admin");

  await request(app.getHttpServer())
    .post("/api/superadmin/staff")
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({
      email: staffEmail,
      password: "super-secret-123",
      name: "Blocked Admin Attempt",
      internalRole: "admin",
    })
    .expect(403);

  await request(app.getHttpServer())
    .post("/api/superadmin/staff")
    .set("Authorization", `Bearer ${superadmin.accessToken}`)
    .send({
      email: `invalid-role+${randomUUID()}@earlycv.dev`,
      password: "super-secret-123",
      name: "Invalid Staff Role",
      internalRole: "none",
    })
    .expect(400);

  const createResponse = await request(app.getHttpServer())
    .post("/api/superadmin/staff")
    .set("Authorization", `Bearer ${superadmin.accessToken}`)
    .send({
      email: staffEmail,
      password: "super-secret-123",
      name: "Hiring Operator",
      internalRole: "admin",
    })
    .expect(201);

  assert.equal(createResponse.body.email, staffEmail);
  assert.equal(createResponse.body.name, "Hiring Operator");
  assert.equal(createResponse.body.isStaff, true);
  assert.equal(createResponse.body.internalRole, "admin");
  assert.equal("passwordHash" in createResponse.body, false);

  const verifiedAt = new Date("2026-04-01T12:00:00.000Z");
  await database.user.update({
    where: { id: createResponse.body.id as string },
    data: { emailVerifiedAt: verifiedAt },
  });

  await request(app.getHttpServer())
    .get("/api/superadmin/staff")
    .set("Authorization", `Bearer ${superadmin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(Array.isArray(body), true);
      assert.equal(
        body.some(
          (user: { id: string; email: string; isStaff: boolean }) =>
            user.id === (createResponse.body.id as string) &&
            user.email === staffEmail &&
            user.isStaff === true,
        ),
        true,
      );
    });

  await request(app.getHttpServer())
    .patch(`/api/superadmin/staff/${createResponse.body.id as string}`)
    .set("Authorization", `Bearer ${superadmin.accessToken}`)
    .send({
      email: updatedStaffEmail,
      name: "Hiring Lead",
      status: "suspended",
    })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.name, "Hiring Lead");
      assert.equal(body.status, "suspended");
      assert.equal(body.email, updatedStaffEmail);
      assert.equal(body.internalRole, "admin");
      assert.equal(body.emailVerifiedAt, null);
    });

  const credentialsAccount = await database.authAccount.findFirst({
    where: {
      userId: createResponse.body.id as string,
      provider: "credentials",
    },
  });

  assert.equal(credentialsAccount?.providerAccountId, updatedStaffEmail);
  assert.equal(credentialsAccount?.providerEmail, updatedStaffEmail);

  const replacementStaffResponse = await request(app.getHttpServer())
    .post("/api/superadmin/staff")
    .set("Authorization", `Bearer ${superadmin.accessToken}`)
    .send({
      email: replacementStaffEmail,
      password: "super-secret-123",
      name: "Replacement Staff",
      internalRole: "admin",
    })
    .expect(201);

  assert.equal(replacementStaffResponse.body.email, replacementStaffEmail);

  const replacementCredentialsAccount = await database.authAccount.findFirst({
    where: {
      userId: replacementStaffResponse.body.id as string,
      provider: "credentials",
    },
  });

  assert.equal(
    replacementCredentialsAccount?.providerAccountId,
    replacementStaffEmail,
  );
  assert.equal(
    replacementCredentialsAccount?.providerEmail,
    replacementStaffEmail,
  );

  await request(app.getHttpServer())
    .patch(`/api/superadmin/staff/${createResponse.body.id as string}/role`)
    .set("Authorization", `Bearer ${superadmin.accessToken}`)
    .send({ internalRole: "none" })
    .expect(400);

  await request(app.getHttpServer())
    .patch(`/api/superadmin/staff/${createResponse.body.id as string}/role`)
    .set("Authorization", `Bearer ${superadmin.accessToken}`)
    .send({ internalRole: "superadmin" })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.id, createResponse.body.id);
      assert.equal(body.internalRole, "superadmin");
      assert.equal(body.isStaff, true);
    });

  await deleteUserByEmail(database, staffEmail);
  await deleteUserByEmail(database, updatedStaffEmail);
  await deleteUserByEmail(database, superadmin.email);
  await deleteUserByEmail(database, admin.email);
  await app.close();
});
