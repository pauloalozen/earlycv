import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { AuthModule } from "../auth/auth.module";
import { DatabaseService } from "../database/database.service";
import { JobSourcesModule } from "../job-sources/job-sources.module";
import { CompaniesModule } from "./companies.module";

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
};

type RegisterResult = {
  accessToken: string;
  email: string;
};

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule, CompaniesModule, JobSourcesModule],
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

test("AppModule wires catalog modules for the integrated backend-core slice", () => {
  const imports = Reflect.getMetadata("imports", AppModule) as unknown[];

  assert.equal(imports.includes(CompaniesModule), true);
  assert.equal(imports.includes(JobSourcesModule), true);
});

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
  };
}

async function promoteToInternalAdmin(
  database: DatabaseService,
  email: string,
  internalRole: "admin" | "superadmin" = "admin",
) {
  const user = await database.user.findUnique({
    where: { email },
  });

  assert.ok(user);

  await database.user.update({
    where: { id: user.id },
    data: {
      isStaff: true,
      internalRole,
    },
  });
}

test("company endpoints reject authenticated product users without internal admin role", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "company-forbidden");

  await request(app.getHttpServer())
    .get("/api/companies")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(403);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("company endpoints create, update, list, and delete catalog records with normalized names", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "company-catalog");
  await promoteToInternalAdmin(database, user.email);
  const server = app.getHttpServer();
  const companyLabel = randomUUID().slice(0, 8);
  const createdName = `ACME Brasil Tecnologia ${companyLabel}`;
  const updatedName = `Acme Dados ${companyLabel}`;
  const createdNormalizedName = `acme-brasil-tecnologia-${companyLabel}`;
  const updatedNormalizedName = `acme-dados-${companyLabel}`;

  const createResponse = await request(server)
    .post("/api/companies")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      name: `  ${createdName}  `,
      websiteUrl: "https://acme.example.com",
      careersUrl: "https://acme.example.com/careers",
      linkedinUrl: "https://linkedin.com/company/acme-brasil",
      industry: "Software",
      country: "BR",
      isActive: true,
    })
    .expect(201);

  assert.equal(createResponse.body.name, createdName);
  assert.equal(createResponse.body.normalizedName, createdNormalizedName);

  await request(server)
    .get("/api/companies")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(Array.isArray(body), true);
      assert.equal(
        body.some(
          (company: { id: string; normalizedName: string }) =>
            company.id === (createResponse.body.id as string) &&
            company.normalizedName === createdNormalizedName,
        ),
        true,
      );
    });

  await request(server)
    .put(`/api/companies/${createResponse.body.id as string}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      name: updatedName,
      industry: "Data",
      isActive: false,
    })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.name, updatedName);
      assert.equal(body.normalizedName, updatedNormalizedName);
      assert.equal(body.industry, "Data");
      assert.equal(body.isActive, false);
    });

  await request(server)
    .delete(`/api/companies/${createResponse.body.id as string}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.deepEqual(body, { ok: true });
    });

  await request(server)
    .get("/api/companies")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(
        body.some(
          (company: { id: string }) =>
            company.id === (createResponse.body.id as string),
        ),
        false,
      );
    });

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("company endpoints validate payloads and reject client-supplied normalized names", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "company-validation");
  await promoteToInternalAdmin(database, user.email);

  await request(app.getHttpServer())
    .post("/api/companies")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      name: "Example Co",
      websiteUrl: "notaurl",
      normalizedName: "client-controlled",
    })
    .expect(400);

  await deleteUserByEmail(database, user.email);
  await app.close();
});
