import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AuthModule } from "../auth/auth.module";
import { CompaniesModule } from "../companies/companies.module";
import { DatabaseService } from "../database/database.service";
import { JobSourcesModule } from "./job-sources.module";

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

test("job-source endpoints create, update, list, and delete sources linked to an existing company", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "job-source-catalog");
  const company = await database.company.create({
    data: {
      name: "EarlyCV Demo",
      normalizedName: `earlycv-demo-${randomUUID()}`,
      country: "BR",
    },
  });
  const server = app.getHttpServer();

  const createResponse = await request(server)
    .post("/api/job-sources")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyId: company.id,
      sourceName: "Workday Main",
      sourceType: "workday",
      sourceUrl: "https://example.myworkdayjobs.com/en-US/careers",
      parserKey: "workday",
      crawlStrategy: "html",
      checkIntervalMinutes: 15,
      isActive: true,
    })
    .expect(201);

  assert.equal(createResponse.body.companyId, company.id);
  assert.equal(createResponse.body.company?.id, company.id);

  await request(server)
    .get("/api/job-sources")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(Array.isArray(body), true);
      assert.equal(
        body.some(
          (jobSource: { id: string; sourceName: string; companyId: string }) =>
            jobSource.id === (createResponse.body.id as string) &&
            jobSource.sourceName === "Workday Main" &&
            jobSource.companyId === company.id,
        ),
        true,
      );
    });

  await request(server)
    .put(`/api/job-sources/${createResponse.body.id as string}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      sourceName: "Workday BR",
      parserKey: "workday-v2",
      checkIntervalMinutes: 30,
      isActive: false,
    })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.sourceName, "Workday BR");
      assert.equal(body.parserKey, "workday-v2");
      assert.equal(body.checkIntervalMinutes, 30);
      assert.equal(body.isActive, false);
    });

  await request(server)
    .delete(`/api/job-sources/${createResponse.body.id as string}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.deepEqual(body, { ok: true });
    });

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("job-source endpoints validate company linkage and reject crawler execution fields", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "job-source-validation");

  await request(app.getHttpServer())
    .post("/api/job-sources")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyId: `missing-${randomUUID()}`,
      sourceName: "Career Site",
      sourceType: "custom_html",
      sourceUrl: "https://careers.example.com",
      parserKey: "custom_html",
      crawlStrategy: "html",
      checkIntervalMinutes: 20,
    })
    .expect(404);

  const company = await database.company.create({
    data: {
      name: "Validation Company",
      normalizedName: `validation-company-${randomUUID()}`,
    },
  });

  await request(app.getHttpServer())
    .post("/api/job-sources")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyId: company.id,
      sourceName: "Career Site",
      sourceType: "custom_html",
      sourceUrl: "https://careers.example.com",
      parserKey: "custom_html",
      crawlStrategy: "html",
      checkIntervalMinutes: 20,
      lastCheckedAt: new Date().toISOString(),
    })
    .expect(400);

  const secondCompany = await database.company.create({
    data: {
      name: "Second Validation Company",
      normalizedName: `second-validation-company-${randomUUID()}`,
    },
  });

  const createdSource = await request(app.getHttpServer())
    .post("/api/job-sources")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyId: company.id,
      sourceName: "Career Site",
      sourceType: "custom_html",
      sourceUrl: "https://careers.example.com/jobs/",
      parserKey: "custom_html",
      crawlStrategy: "html",
      checkIntervalMinutes: 20,
    })
    .expect(201);

  await request(app.getHttpServer())
    .put(`/api/job-sources/${createdSource.body.id as string}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyId: secondCompany.id,
    })
    .expect(400);

  await request(app.getHttpServer())
    .post("/api/job-sources")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyId: company.id,
      sourceName: "Career Site Duplicate",
      sourceType: "custom_html",
      sourceUrl: "https://careers.example.com/jobs",
      parserKey: "custom_html",
      crawlStrategy: "html",
      checkIntervalMinutes: 20,
    })
    .expect(409);

  await deleteUserByEmail(database, user.email);
  await app.close();
});
