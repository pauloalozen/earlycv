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
import { JobSourcesModule } from "../job-sources/job-sources.module";
import { JobsModule } from "./jobs.module";

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
};

type RegisterResult = {
  accessToken: string;
  email: string;
};

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule, CompaniesModule, JobSourcesModule, JobsModule],
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

test("job endpoints reject authenticated product users without internal admin role", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "jobs-forbidden");

  await request(app.getHttpServer())
    .get("/api/jobs")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(403);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("POST /api/jobs requires firstSeenAt and stores canonical job fields", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "jobs-create");
  await promoteToInternalAdmin(database, user.email);
  const company = await database.company.create({
    data: {
      name: "EarlyCV Demo",
      normalizedName: `earlycv-demo-${randomUUID()}`,
      country: "BR",
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      companyId: company.id,
      sourceName: "Career Site",
      sourceType: "custom_html",
      sourceUrl: `https://careers.example.com/${randomUUID()}`,
      parserKey: "custom_html",
      crawlStrategy: "html",
      checkIntervalMinutes: 30,
    },
  });
  const server = app.getHttpServer();

  await request(server)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyId: company.id,
      jobSourceId: jobSource.id,
      sourceJobUrl: `https://careers.example.com/jobs/${randomUUID()}`,
      canonicalKey: `earlycv-demo:data-analyst:${randomUUID()}`,
      title: "Data Analyst",
      normalizedTitle: "data analyst",
      descriptionRaw: "Raw desc",
      descriptionClean: "Clean desc",
      locationText: "Sao Paulo, BR",
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      status: "active",
    })
    .expect(201)
    .expect(({ body }) => {
      assert.equal(typeof body.id, "string");
      assert.equal(body.companyId, company.id);
      assert.equal(body.jobSourceId, jobSource.id);
      assert.equal(
        body.canonicalKey.startsWith("earlycv-demo:data-analyst:"),
        true,
      );
      assert.equal(typeof body.firstSeenAt, "string");
    });

  await request(server)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyId: company.id,
      jobSourceId: jobSource.id,
      sourceJobUrl: `https://careers.example.com/jobs/${randomUUID()}`,
      canonicalKey: `earlycv-demo:data-analyst:${randomUUID()}`,
      title: "Data Analyst",
      normalizedTitle: "data analyst",
      descriptionRaw: "Raw desc",
      descriptionClean: "Clean desc",
      locationText: "Sao Paulo, BR",
      lastSeenAt: new Date().toISOString(),
      status: "active",
    })
    .expect(400);

  const canonicalKey = `earlycv-demo:data-analyst:${randomUUID()}`;

  await request(server)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyId: company.id,
      jobSourceId: jobSource.id,
      sourceJobUrl: `https://careers.example.com/jobs/${randomUUID()}`,
      canonicalKey,
      title: "Data Analyst",
      normalizedTitle: "data analyst",
      descriptionRaw: "Raw desc",
      descriptionClean: "Clean desc",
      locationText: "Sao Paulo, BR",
      firstSeenAt: "2026-03-30T10:00:00.000Z",
      lastSeenAt: "2026-03-30T11:00:00.000Z",
      status: "active",
    })
    .expect(201);

  await request(server)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyId: company.id,
      jobSourceId: jobSource.id,
      sourceJobUrl: `https://careers.example.com/jobs/${randomUUID()}?utm=campaign`,
      canonicalKey,
      title: "Data Analyst",
      normalizedTitle: "data analyst",
      descriptionRaw: "Raw desc",
      descriptionClean: "Clean desc",
      locationText: "Sao Paulo, BR",
      firstSeenAt: "2026-03-30T10:00:00.000Z",
      lastSeenAt: "2026-03-30T11:00:00.000Z",
      status: "active",
    })
    .expect(409);

  await request(server)
    .post("/api/jobs")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyId: company.id,
      jobSourceId: jobSource.id,
      sourceJobUrl: `https://careers.example.com/jobs/${randomUUID()}#fragment`,
      canonicalKey: `earlycv-demo:data-engineer:${randomUUID()}`,
      title: "Data Engineer",
      normalizedTitle: "data engineer",
      descriptionRaw: "Raw desc",
      descriptionClean: "Clean desc",
      locationText: "Sao Paulo, BR",
      firstSeenAt: "2026-03-30T12:00:00.000Z",
      lastSeenAt: "2026-03-30T11:00:00.000Z",
      status: "active",
    })
    .expect(400);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("job endpoints list, fetch, update, and delete canonical jobs", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "jobs-crud");
  await promoteToInternalAdmin(database, user.email);
  const company = await database.company.create({
    data: {
      name: "CRUD Company",
      normalizedName: `crud-company-${randomUUID()}`,
      country: "BR",
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      companyId: company.id,
      sourceName: "CRUD Source",
      sourceType: "custom_html",
      sourceUrl: `https://crud.example.com/${randomUUID()}`,
      parserKey: "custom_html",
      crawlStrategy: "html",
      checkIntervalMinutes: 15,
    },
  });
  const server = app.getHttpServer();
  const createdJob = await database.job.create({
    data: {
      companyId: company.id,
      jobSourceId: jobSource.id,
      sourceJobUrl: `https://crud.example.com/jobs/${randomUUID()}`,
      canonicalKey: `crud-company:analytics-engineer:${randomUUID()}`,
      title: "Analytics Engineer",
      normalizedTitle: "analytics engineer",
      descriptionRaw: "Original raw description",
      descriptionClean: "Original clean description",
      locationText: "Sao Paulo, BR",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      status: "active",
    },
  });

  await request(server)
    .get("/api/jobs")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(Array.isArray(body), true);
      assert.equal(
        body.some(
          (job: { id: string; canonicalKey: string }) =>
            job.id === createdJob.id &&
            job.canonicalKey === createdJob.canonicalKey,
        ),
        true,
      );
    });

  await request(server)
    .get(`/api/jobs/${createdJob.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.id, createdJob.id);
      assert.equal(body.title, "Analytics Engineer");
    });

  await request(server)
    .put(`/api/jobs/${createdJob.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      title: "Senior Analytics Engineer",
      descriptionClean: "Updated clean description",
      lastSeenAt: new Date().toISOString(),
      status: "inactive",
    })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.title, "Senior Analytics Engineer");
      assert.equal(body.descriptionClean, "Updated clean description");
      assert.equal(body.status, "inactive");
    });

  await request(server)
    .put(`/api/jobs/${createdJob.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      canonicalKey: `changed:${randomUUID()}`,
      companyId: company.id,
      jobSourceId: jobSource.id,
      sourceJobUrl: `https://different.example.com/jobs/${randomUUID()}`,
      firstSeenAt: new Date().toISOString(),
    })
    .expect(400);

  await request(server)
    .delete(`/api/jobs/${createdJob.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.deepEqual(body, { ok: true });
    });

  await request(server)
    .get(`/api/jobs/${createdJob.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(404);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("POST /api/jobs rejects jobs whose source belongs to a different company", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "jobs-linkage");
  await promoteToInternalAdmin(database, user.email);
  const company = await database.company.create({
    data: {
      name: "Primary Company",
      normalizedName: `primary-company-${randomUUID()}`,
    },
  });
  const differentCompany = await database.company.create({
    data: {
      name: "Different Company",
      normalizedName: `different-company-${randomUUID()}`,
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      companyId: company.id,
      sourceName: "Primary Source",
      sourceType: "custom_html",
      sourceUrl: `https://linkage.example.com/${randomUUID()}`,
      parserKey: "custom_html",
      crawlStrategy: "html",
      checkIntervalMinutes: 10,
    },
  });

  await request(app.getHttpServer())
    .post("/api/jobs")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyId: differentCompany.id,
      jobSourceId: jobSource.id,
      sourceJobUrl: `https://linkage.example.com/jobs/${randomUUID()}`,
      canonicalKey: `different-company:data-analyst:${randomUUID()}`,
      title: "Data Analyst",
      normalizedTitle: "data analyst",
      descriptionRaw: "Raw desc",
      descriptionClean: "Clean desc",
      locationText: "Sao Paulo, BR",
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      status: "active",
    })
    .expect(400);

  await deleteUserByEmail(database, user.email);
  await app.close();
});
