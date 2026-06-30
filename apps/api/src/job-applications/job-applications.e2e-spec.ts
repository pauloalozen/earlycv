import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";
import { StorageService } from "../storage/storage.service";

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
};

type RegisterResult = {
  accessToken: string;
  email: string;
  userId: string;
};

const openApps = new Set<INestApplication>();

async function createApp() {
  if (
    process.env.NODE_ENV === "test" &&
    !process.env.SKIP_TURNSTILE_VERIFICATION
  ) {
    process.env.SKIP_TURNSTILE_VERIFICATION = "true";
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(StorageService)
    .useValue({
      async deleteObject() {
        return;
      },
      async getObject() {
        return Buffer.from("mock");
      },
      async putObject(key: string) {
        return `https://mock.local/${key}`;
      },
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
  openApps.add(app);

  return {
    app,
    database: app.get(DatabaseService),
  };
}

afterEach(async () => {
  const apps = Array.from(openApps);
  openApps.clear();
  await Promise.all(
    apps.map(async (app) => {
      try {
        await app.close();
      } catch {
        return;
      }
    }),
  );
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
  const safePrefix = prefix
    .replace(/[^a-z0-9-]/gi, "")
    .toLowerCase()
    .slice(0, 24);
  const email = `${safePrefix}+${randomUUID()}@earlycv.dev`;

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
    email,
    userId: response.body.user.id as string,
  };
}

// ─── POST /job-applications ───────────────────────────────────────────────────

test("POST /job-applications creates manual application with required fields", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "ja-create-manual");

  const res = await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      jobTitle: "Engenheiro de Software",
      companyName: "Acme Corp",
    });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.jobTitle, "Engenheiro de Software");
  assert.equal(res.body.companyName, "Acme Corp");
  assert.equal(res.body.status, "SAVED");
  assert.equal(res.body.userId, user.userId);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("POST /job-applications accepts optional jobUrl for manual origin", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "ja-create-url");

  const res = await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      jobTitle: "Designer UX",
      companyName: "Studio",
      origin: "manual",
    });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.jobUrl, null);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("POST /job-applications fails without jobTitle", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "ja-missing-title");

  const res = await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ companyName: "Corp" });

  assert.equal(res.status, 400);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("POST /job-applications fails without companyName", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "ja-missing-company");

  const res = await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ jobTitle: "Dev" });

  assert.equal(res.status, 400);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("POST /job-applications fails for imported_url without jobUrl", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "ja-imported-no-url");

  const res = await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      jobTitle: "Dev",
      companyName: "Corp",
      origin: "imported_url",
    });

  assert.equal(res.status, 400);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("POST /job-applications requires authentication", async () => {
  const { app } = await createApp();

  const res = await request(app.getHttpServer())
    .post("/api/job-applications")
    .send({ jobTitle: "Dev", companyName: "Corp" });

  assert.equal(res.status, 401);

  await app.close();
});

// ─── GET /job-applications ────────────────────────────────────────────────────

test("GET /job-applications returns only the authenticated user's applications", async () => {
  const { app, database } = await createApp();
  const user1 = await registerUser(app, database, "ja-list-user1");
  const user2 = await registerUser(app, database, "ja-list-user2");

  await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user1.accessToken}`)
    .send({ jobTitle: "Dev User1", companyName: "Corp1" });

  await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user2.accessToken}`)
    .send({ jobTitle: "Dev User2", companyName: "Corp2" });

  const res = await request(app.getHttpServer())
    .get("/api/job-applications")
    .set("Authorization", `Bearer ${user1.accessToken}`);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(
    res.body.items.every(
      (item: { userId: string }) => item.userId === user1.userId,
    ),
  );

  await deleteUserByEmail(database, user1.email);
  await deleteUserByEmail(database, user2.email);
  await app.close();
});

test("GET /job-applications requires authentication", async () => {
  const { app } = await createApp();

  const res = await request(app.getHttpServer()).get("/api/job-applications");
  assert.equal(res.status, 401);

  await app.close();
});

// ─── GET /job-applications/:id ────────────────────────────────────────────────

test("GET /job-applications/:id returns application detail", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "ja-detail");

  const created = await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ jobTitle: "Dev", companyName: "Corp" });

  const res = await request(app.getHttpServer())
    .get(`/api/job-applications/${created.body.id as string}`)
    .set("Authorization", `Bearer ${user.accessToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.id, created.body.id);
  assert.ok(Array.isArray(res.body.events));
  assert.ok(Array.isArray(res.body.cvAdaptations));

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("GET /job-applications/:id returns 404 for another user's application", async () => {
  const { app, database } = await createApp();
  const user1 = await registerUser(app, database, "ja-detail-owner");
  const user2 = await registerUser(app, database, "ja-detail-other");

  const created = await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user1.accessToken}`)
    .send({ jobTitle: "Dev", companyName: "Corp" });

  const res = await request(app.getHttpServer())
    .get(`/api/job-applications/${created.body.id as string}`)
    .set("Authorization", `Bearer ${user2.accessToken}`);

  assert.equal(res.status, 404);

  await deleteUserByEmail(database, user1.email);
  await deleteUserByEmail(database, user2.email);
  await app.close();
});

// ─── PATCH /job-applications/:id/status ──────────────────────────────────────

test("PATCH /job-applications/:id/status updates status and records event", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "ja-status-update");

  const created = await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ jobTitle: "Dev", companyName: "Corp" });

  const res = await request(app.getHttpServer())
    .patch(`/api/job-applications/${created.body.id as string}/status`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ status: "APPLIED" });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "APPLIED");

  // Verify event was created in DB
  const appInDb = await database.jobApplication.findUnique({
    where: { id: created.body.id as string },
    include: { events: true },
  });
  assert.ok(
    appInDb?.events.some((e) => e.eventType === "MARKED_AS_SENT"),
    "MARKED_AS_SENT event deve existir",
  );
  assert.ok(appInDb?.appliedAt !== null, "appliedAt deve estar preenchido");

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("PATCH /job-applications/:id/status rejects invalid status", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "ja-invalid-status");

  const created = await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ jobTitle: "Dev", companyName: "Corp" });

  const res = await request(app.getHttpServer())
    .patch(`/api/job-applications/${created.body.id as string}/status`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ status: "INVALID_STATUS" });

  assert.equal(res.status, 400);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("PATCH /job-applications/:id/status enforces ownership", async () => {
  const { app, database } = await createApp();
  const user1 = await registerUser(app, database, "ja-status-owner");
  const user2 = await registerUser(app, database, "ja-status-attacker");

  const created = await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user1.accessToken}`)
    .send({ jobTitle: "Dev", companyName: "Corp" });

  const res = await request(app.getHttpServer())
    .patch(`/api/job-applications/${created.body.id as string}/status`)
    .set("Authorization", `Bearer ${user2.accessToken}`)
    .send({ status: "APPLIED" });

  assert.equal(res.status, 404);

  await deleteUserByEmail(database, user1.email);
  await deleteUserByEmail(database, user2.email);
  await app.close();
});

// ─── POST /job-applications/:id/notes ────────────────────────────────────────

test("POST /job-applications/:id/notes adds note and records event", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "ja-note-add");

  const created = await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ jobTitle: "Dev", companyName: "Corp" });

  const res = await request(app.getHttpServer())
    .post(`/api/job-applications/${created.body.id as string}/notes`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ note: "Contato feito via LinkedIn." });

  assert.equal(res.status, 201);

  const appInDb = await database.jobApplication.findUnique({
    where: { id: created.body.id as string },
    include: { events: true },
  });
  assert.equal(appInDb?.notes, "Contato feito via LinkedIn.");
  assert.ok(appInDb?.events.some((e) => e.eventType === "NOTE_ADDED"));

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("POST /job-applications/:id/notes enforces ownership", async () => {
  const { app, database } = await createApp();
  const user1 = await registerUser(app, database, "ja-note-owner");
  const user2 = await registerUser(app, database, "ja-note-attacker");

  const created = await request(app.getHttpServer())
    .post("/api/job-applications")
    .set("Authorization", `Bearer ${user1.accessToken}`)
    .send({ jobTitle: "Dev", companyName: "Corp" });

  const res = await request(app.getHttpServer())
    .post(`/api/job-applications/${created.body.id as string}/notes`)
    .set("Authorization", `Bearer ${user2.accessToken}`)
    .send({ note: "tentativa de nota maliciosa" });

  assert.equal(res.status, 404);

  await deleteUserByEmail(database, user1.email);
  await deleteUserByEmail(database, user2.email);
  await app.close();
});
