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

test("resume endpoints stay scoped to the authenticated user", async () => {
  const { app, database } = await createApp();
  const firstUser = await registerUser(app, database, "resume-one");
  const secondUser = await registerUser(app, database, "resume-two");

  const ownResumeResponse = await request(app.getHttpServer())
    .post("/api/resumes")
    .set("Authorization", `Bearer ${firstUser.accessToken}`)
    .send({
      title: "Data Resume",
      sourceFileName: "resume-ana.pdf",
      sourceFileType: "application/pdf",
      status: "uploaded",
    })
    .expect(201);

  const ownResumeId = ownResumeResponse.body.id as string;

  const otherResume = await database.resume.create({
    data: {
      userId: secondUser.userId,
      title: "Other Resume",
      status: "draft",
    },
  });

  await request(app.getHttpServer())
    .get("/api/resumes")
    .set("Authorization", `Bearer ${firstUser.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(Array.isArray(body), true);
      assert.equal(body.length, 1);
      assert.equal(body[0]?.id, ownResumeId);
      assert.equal(body[0]?.userId, firstUser.userId);
      assert.equal(body[0]?.isPrimary, true);
      assert.equal(body[0]?.primaryResumeSlot, 1);
    });

  await request(app.getHttpServer())
    .get(`/api/resumes/${ownResumeId}`)
    .set("Authorization", `Bearer ${firstUser.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.id, ownResumeId);
      assert.equal(body.userId, firstUser.userId);
      assert.equal(body.title, "Data Resume");
    });

  await request(app.getHttpServer())
    .get(`/api/resumes/${otherResume.id}`)
    .set("Authorization", `Bearer ${firstUser.accessToken}`)
    .expect(404);

  await request(app.getHttpServer())
    .put(`/api/resumes/${otherResume.id}`)
    .set("Authorization", `Bearer ${firstUser.accessToken}`)
    .send({ title: "Should Not Leak" })
    .expect(404);

  await deleteUserByEmail(database, firstUser.email);
  await deleteUserByEmail(database, secondUser.email);
  await app.close();
});

test("POST /api/resumes/:id/set-primary keeps one primary resume per user", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "resume-primary");
  const otherUser = await registerUser(app, database, "resume-primary-other");

  const firstResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "Resume One",
      status: "uploaded",
      isPrimary: true,
      primaryResumeSlot: 1,
    },
  });
  const secondResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "Resume Two",
      status: "reviewed",
    },
  });
  const otherResume = await database.resume.create({
    data: {
      userId: otherUser.userId,
      title: "Other User Resume",
      status: "draft",
      isPrimary: true,
      primaryResumeSlot: 1,
    },
  });

  await request(app.getHttpServer())
    .post(`/api/resumes/${secondResume.id}/set-primary`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.id, secondResume.id);
      assert.equal(body.isPrimary, true);
      assert.equal(body.primaryResumeSlot, 1);
    });

  const userResumes = await database.resume.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: "asc" },
  });
  const refreshedOtherResume = await database.resume.findUnique({
    where: { id: otherResume.id },
  });

  assert.equal(userResumes.filter((resume) => resume.isPrimary).length, 1);
  assert.equal(
    userResumes.find((resume) => resume.id === firstResume.id)?.isPrimary,
    false,
  );
  assert.equal(
    userResumes.find((resume) => resume.id === firstResume.id)
      ?.primaryResumeSlot,
    null,
  );
  assert.equal(
    userResumes.find((resume) => resume.id === secondResume.id)?.isPrimary,
    true,
  );
  assert.equal(
    userResumes.find((resume) => resume.id === secondResume.id)
      ?.primaryResumeSlot,
    1,
  );
  assert.equal(refreshedOtherResume?.isPrimary, true);
  assert.equal(refreshedOtherResume?.primaryResumeSlot, 1);

  await request(app.getHttpServer())
    .post(`/api/resumes/${otherResume.id}/set-primary`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(404);

  await deleteUserByEmail(database, user.email);
  await deleteUserByEmail(database, otherUser.email);
  await app.close();
});

test("updating the current primary resume cannot leave the user without a primary resume", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "resume-update-primary");

  const primaryResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "Primary Resume",
      status: "uploaded",
      isPrimary: true,
      primaryResumeSlot: 1,
    },
  });

  await request(app.getHttpServer())
    .put(`/api/resumes/${primaryResume.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ isPrimary: false, title: "Updated Primary Resume" })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.isPrimary, true);
      assert.equal(body.primaryResumeSlot, 1);
      assert.equal(body.title, "Updated Primary Resume");
    });

  const refreshedResume = await database.resume.findUnique({
    where: { id: primaryResume.id },
  });

  assert.equal(refreshedResume?.isPrimary, true);
  assert.equal(refreshedResume?.primaryResumeSlot, 1);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("DELETE /api/resumes/:id removes only the authenticated user's resume and promotes another when needed", async () => {
  const { app, database } = await createApp();
  const firstUser = await registerUser(app, database, "resume-delete-one");
  const secondUser = await registerUser(app, database, "resume-delete-two");

  const ownResume = await database.resume.create({
    data: {
      userId: firstUser.userId,
      title: "Keep Primary",
      status: "draft",
      isPrimary: true,
      primaryResumeSlot: 1,
    },
  });
  const secondaryResume = await database.resume.create({
    data: {
      userId: firstUser.userId,
      title: "Delete Me",
      status: "reviewed",
    },
  });
  const otherResume = await database.resume.create({
    data: {
      userId: secondUser.userId,
      title: "Keep Me",
      status: "reviewed",
    },
  });

  await request(app.getHttpServer())
    .delete(`/api/resumes/${otherResume.id}`)
    .set("Authorization", `Bearer ${firstUser.accessToken}`)
    .expect(404);

  await request(app.getHttpServer())
    .delete(`/api/resumes/${ownResume.id}`)
    .set("Authorization", `Bearer ${firstUser.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.deepEqual(body, { ok: true });
    });

  const deletedPrimaryResume = await database.resume.findUnique({
    where: { id: ownResume.id },
  });
  const promotedResume = await database.resume.findUnique({
    where: { id: secondaryResume.id },
  });
  const untouchedOtherResume = await database.resume.findUnique({
    where: { id: otherResume.id },
  });

  assert.equal(deletedPrimaryResume, null);
  assert.equal(promotedResume?.isPrimary, true);
  assert.equal(promotedResume?.primaryResumeSlot, 1);
  assert.equal(untouchedOtherResume?.id, otherResume.id);

  await deleteUserByEmail(database, firstUser.email);
  await deleteUserByEmail(database, secondUser.email);
  await app.close();
});
