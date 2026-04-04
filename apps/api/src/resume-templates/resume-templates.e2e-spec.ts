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

test("public GET /resume-templates returns active templates without auth", async () => {
  const { app, database } = await createApp();

  // Seed 2 active and 1 inactive template
  const template1 = await database.resumeTemplate.create({
    data: {
      name: "Clássico",
      slug: "classico-public-test",
      description: "Clean and simple",
      targetRole: "General",
      isActive: true,
    },
  });

  const template2 = await database.resumeTemplate.create({
    data: {
      name: "Moderno",
      slug: "moderno-public-test",
      description: "Modern layout",
      targetRole: "Tech",
      isActive: true,
    },
  });

  const template3 = await database.resumeTemplate.create({
    data: {
      name: "Inactive",
      slug: "inactive-public-test",
      description: "Should not appear",
      targetRole: "Hidden",
      isActive: false,
    },
  });

  // Public request without auth
  await request(app.getHttpServer())
    .get("/api/resume-templates")
    .expect(200)
    .expect(({ body }) => {
      assert.equal(Array.isArray(body), true);
      // Should include active templates
      assert.equal(
        body.some((t: { id: string; slug: string }) => t.id === template1.id),
        true,
      );
      assert.equal(
        body.some((t: { id: string; slug: string }) => t.id === template2.id),
        true,
      );
      // Should NOT include inactive
      assert.equal(
        body.some((t: { id: string; slug: string }) => t.id === template3.id),
        false,
      );
      // Response should have expected fields
      const template = body.find((t: { id: string }) => t.id === template1.id);
      assert.ok(template.name);
      assert.ok(template.slug);
      assert.ok(template.description);
    });

  // Cleanup
  await database.resumeTemplate.deleteMany({
    where: {
      slug: {
        in: [
          "classico-public-test",
          "moderno-public-test",
          "inactive-public-test",
        ],
      },
    },
  });
  await app.close();
});

test("admin resume template endpoints create, list, update, and toggle template status", async () => {
  const { app, database } = await createApp();
  const admin = await registerUser(app, database, "resume-template-admin");
  const templateSlug = `resume-template-${randomUUID()}`;

  await promoteToInternalAdmin(database, admin.userId, "admin");

  const createResponse = await request(app.getHttpServer())
    .post("/api/admin/resume-templates")
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({
      name: "Platform Engineering",
      slug: templateSlug,
      description: "Template for staff-managed platform applications",
      targetRole: "Platform Engineer",
      fileUrl: "https://cdn.earlycv.dev/templates/platform-engineering.docx",
      structureJson: {
        sections: ["summary", "experience", "projects"],
      },
    })
    .expect(201);

  assert.equal(createResponse.body.name, "Platform Engineering");
  assert.equal(createResponse.body.slug, templateSlug);
  assert.equal(createResponse.body.isActive, true);

  await request(app.getHttpServer())
    .get("/api/admin/resume-templates")
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(Array.isArray(body), true);
      assert.equal(
        body.some(
          (template: { id: string; slug: string; isActive: boolean }) =>
            template.id === (createResponse.body.id as string) &&
            template.slug === templateSlug &&
            template.isActive === true,
        ),
        true,
      );
    });

  await request(app.getHttpServer())
    .patch(`/api/admin/resume-templates/${createResponse.body.id as string}`)
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({
      name: "Platform Engineering Updated",
      description: "Updated template",
      targetRole: "Senior Platform Engineer",
    })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.name, "Platform Engineering Updated");
      assert.equal(body.description, "Updated template");
      assert.equal(body.targetRole, "Senior Platform Engineer");
      assert.equal(body.isActive, true);
    });

  await request(app.getHttpServer())
    .post(
      `/api/admin/resume-templates/${createResponse.body.id as string}/toggle-status`,
    )
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.id, createResponse.body.id);
      assert.equal(body.isActive, false);
    });

  await database.resumeTemplate.deleteMany({
    where: { slug: templateSlug },
  });
  await deleteUserByEmail(database, admin.email);
  await app.close();
});
