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

test("admin resume endpoints list, fetch, update, and set a single master resume", async () => {
  const { app, database } = await createApp();
  const admin = await registerUser(app, database, "admin-resume-admin");
  const productUser = await registerUser(app, database, "admin-resume-product");
  const secondProductUser = await registerUser(
    app,
    database,
    "admin-resume-second",
  );
  const staffUser = await registerUser(app, database, "admin-resume-staff");

  await promoteToInternalAdmin(database, admin.userId);
  await database.user.update({
    where: { id: staffUser.userId },
    data: {
      isStaff: true,
      internalRole: "admin",
    },
  });

  const masterResume = await database.resume.create({
    data: {
      userId: productUser.userId,
      title: "Master Resume",
      sourceFileName: "master.pdf",
      status: "uploaded",
      kind: "master",
      isMaster: true,
    },
  });
  const adaptedResume = await database.resume.create({
    data: {
      userId: productUser.userId,
      title: "Adapted Resume",
      sourceFileName: "adapted.pdf",
      status: "reviewed",
      kind: "adapted",
      isMaster: false,
      basedOnResumeId: masterResume.id,
    },
  });
  const secondUserResume = await database.resume.create({
    data: {
      userId: secondProductUser.userId,
      title: "Second User Resume",
      status: "draft",
      kind: "master",
      isMaster: true,
    },
  });
  await database.resume.create({
    data: {
      userId: staffUser.userId,
      title: "Staff Resume",
      status: "draft",
      kind: "master",
      isMaster: true,
    },
  });

  await request(app.getHttpServer())
    .get("/api/admin/resumes")
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(Array.isArray(body), true);

      const listedAdaptedResume = body.find(
        (resume: { id: string }) => resume.id === adaptedResume.id,
      ) as Record<string, unknown> | undefined;

      assert.ok(listedAdaptedResume);
      assert.equal(listedAdaptedResume.userId, productUser.userId);
      assert.equal(listedAdaptedResume.kind, "adapted");
      assert.equal(listedAdaptedResume.isMaster, false);
      assert.equal(
        body.some(
          (resume: { userId: string }) => resume.userId === staffUser.userId,
        ),
        false,
      );
    });

  await request(app.getHttpServer())
    .get(`/api/admin/resumes/${adaptedResume.id}`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.id, adaptedResume.id);
      assert.equal(body.userId, productUser.userId);
      assert.equal(body.basedOnResumeId, masterResume.id);
    });

  await request(app.getHttpServer())
    .patch(`/api/admin/resumes/${adaptedResume.id}`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({
      title: "Adapted Resume Final",
      status: "uploaded",
      sourceFileName: "adapted-final.pdf",
    })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.id, adaptedResume.id);
      assert.equal(body.title, "Adapted Resume Final");
      assert.equal(body.status, "uploaded");
      assert.equal(body.sourceFileName, "adapted-final.pdf");
    });

  await request(app.getHttpServer())
    .post(`/api/admin/resumes/${adaptedResume.id}/set-master`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.id, adaptedResume.id);
      assert.equal(body.userId, productUser.userId);
      assert.equal(body.isMaster, true);
      assert.equal(body.kind, "master");
    });

  const productResumes = await database.resume.findMany({
    where: { userId: productUser.userId },
    orderBy: { createdAt: "asc" },
  });
  const refreshedSecondUserResume = await database.resume.findUnique({
    where: { id: secondUserResume.id },
  });

  assert.equal(productResumes.filter((resume) => resume.isMaster).length, 1);
  assert.equal(
    productResumes.find((resume) => resume.id === masterResume.id)?.isMaster,
    false,
  );
  assert.equal(
    productResumes.find((resume) => resume.id === adaptedResume.id)?.isMaster,
    true,
  );
  assert.equal(
    productResumes.find((resume) => resume.id === adaptedResume.id)?.kind,
    "master",
  );
  assert.equal(refreshedSecondUserResume?.isMaster, true);

  await request(app.getHttpServer())
    .post(`/api/admin/resumes/${secondUserResume.id}/set-master`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.id, secondUserResume.id);
      assert.equal(body.userId, secondProductUser.userId);
      assert.equal(body.isMaster, true);
    });

  await deleteUserByEmail(database, admin.email);
  await deleteUserByEmail(database, productUser.email);
  await deleteUserByEmail(database, secondProductUser.email);
  await deleteUserByEmail(database, staffUser.email);
  await app.close();
});

test("admin resume update rejects adapted resumes with no adaptation context", async () => {
  const { app, database } = await createApp();
  const admin = await registerUser(app, database, "admin-resume-context-admin");
  const productUser = await registerUser(
    app,
    database,
    "admin-resume-context-user",
  );

  await promoteToInternalAdmin(database, admin.userId, "superadmin");

  const masterResume = await database.resume.create({
    data: {
      userId: productUser.userId,
      title: "Master Resume",
      status: "uploaded",
      kind: "master",
      isMaster: true,
    },
  });
  const adaptedResume = await database.resume.create({
    data: {
      userId: productUser.userId,
      title: "Adapted Resume",
      status: "reviewed",
      kind: "adapted",
      isMaster: false,
      basedOnResumeId: masterResume.id,
    },
  });

  await request(app.getHttpServer())
    .patch(`/api/admin/resumes/${adaptedResume.id}`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({
      basedOnResumeId: null,
      templateId: null,
      targetJobId: null,
      targetJobTitle: null,
    })
    .expect(400)
    .expect(({ body }) => {
      assert.equal(body.message, "adapted resume requires adaptation context");
    });

  const refreshedResume = await database.resume.findUnique({
    where: { id: adaptedResume.id },
  });

  assert.equal(refreshedResume?.kind, "adapted");
  assert.equal(refreshedResume?.basedOnResumeId, masterResume.id);

  await deleteUserByEmail(database, admin.email);
  await deleteUserByEmail(database, productUser.email);
  await app.close();
});
