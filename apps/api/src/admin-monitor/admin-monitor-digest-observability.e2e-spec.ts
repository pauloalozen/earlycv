import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";

// Cobre permissões administrativas dos 3 endpoints novos/alterados de
// observabilidade multi-provider (/admin/monitor/digest/stats,
// digest/history, digests/:id/timeline) — nenhum e2e existia pra este
// controller antes desta feature (o guard JwtAuthGuard+RolesGuard já
// existia, só nunca tinha sido exercitado via HTTP real).

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
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

  return { app, database: app.get(DatabaseService) };
}

async function deleteUserByEmail(database: DatabaseService, email: string) {
  await (database.user as DeleteManyDelegate).deleteMany({ where: { email } });
}

async function registerUser(
  app: INestApplication,
  database: DatabaseService,
  prefix: string,
) {
  const email = `${prefix}+${randomUUID()}@earlycv.dev`;
  await deleteUserByEmail(database, email);

  const response = await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({ email, password: "Super-secret-123", name: `${prefix} User` });

  assert.equal(response.status, 201, JSON.stringify(response.body));

  return {
    accessToken: response.body.accessToken as string,
    userId: response.body.user.id as string,
    email,
  };
}

test("admin/monitor digest observability endpoints deny anonymous and common users, allow admin", async () => {
  const { app, database } = await createApp();
  try {
    const commonUser = await registerUser(app, database, "obs-common");
    const adminUser = await registerUser(app, database, "obs-admin");
    await database.user.update({
      where: { id: adminUser.userId },
      data: { isStaff: true, internalRole: "admin" },
    });

    for (const path of [
      "/api/admin/monitor/digest/stats",
      "/api/admin/monitor/digest/history",
      `/api/admin/monitor/digests/${randomUUID()}/timeline`,
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path)
        .set("Authorization", `Bearer ${commonUser.accessToken}`)
        .expect(403);
    }

    await request(app.getHttpServer())
      .get("/api/admin/monitor/digest/stats")
      .set("Authorization", `Bearer ${adminUser.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get("/api/admin/monitor/digest/history")
      .set("Authorization", `Bearer ${adminUser.accessToken}`)
      .expect(200);

    // Digest inexistente — 404, não 500/403 (guard já passou).
    await request(app.getHttpServer())
      .get(`/api/admin/monitor/digests/${randomUUID()}/timeline`)
      .set("Authorization", `Bearer ${adminUser.accessToken}`)
      .expect(404);

    await deleteUserByEmail(database, commonUser.email);
    await deleteUserByEmail(database, adminUser.email);
  } finally {
    await app.close();
  }
});

test("GET /api/admin/monitor/digest/stats as admin returns the summary/rates shape with real data", async () => {
  const { app, database } = await createApp();
  try {
    const adminUser = await registerUser(app, database, "obs-stats-admin");
    await database.user.update({
      where: { id: adminUser.userId },
      data: { isStaff: true, internalRole: "admin" },
    });

    const res = await request(app.getHttpServer())
      .get("/api/admin/monitor/digest/stats?periodDays=7")
      .set("Authorization", `Bearer ${adminUser.accessToken}`)
      .expect(200);

    assert.equal(res.body.periodDays, 7);
    assert.ok(res.body.summary);
    assert.ok("deliveryRate" in res.body.summary.rates);
    assert.ok("openRate" in res.body.summary.rates);
    assert.ok("clickRate" in res.body.summary.rates);
    assert.ok("bounceRate" in res.body.summary.rates);
    assert.ok("complaintRate" in res.body.summary.rates);
    assert.ok(res.body.byProvider);
    assert.ok(res.body.byStatus);

    await deleteUserByEmail(database, adminUser.email);
  } finally {
    await app.close();
  }
});
