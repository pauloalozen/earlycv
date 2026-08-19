import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { Test } from "@nestjs/testing";

import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { AdminUsersModule } from "./admin-users.module";
import { AdminUsersService } from "./admin-users.service";

async function buildFixture() {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, AdminUsersModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AdminUsersService);
  const suffix = randomUUID();

  const staffUser = await database.user.create({
    data: {
      email: `staff-${suffix}@example.com`,
      isStaff: true,
      name: `Staff ${suffix}`,
    },
  });

  const userAusente = await database.user.create({
    data: {
      email: `ausente-${suffix}@example.com`,
      name: `Ausente ${suffix}`,
      planType: "free",
    },
  });

  const userIncompleto = await database.user.create({
    data: {
      email: `incompleto-${suffix}@example.com`,
      name: `Incompleto ${suffix}`,
      planType: "starter",
      profile: { create: { headline: "Dev" } },
    },
  });

  const userSemMaster = await database.user.create({
    data: {
      email: `semmaster-${suffix}@example.com`,
      name: `SemMaster ${suffix}`,
      planType: "pro",
      profile: {
        create: { city: "Sao Paulo", country: "BR", headline: "Dev" },
      },
    },
  });

  const userCompleto = await database.user.create({
    data: {
      email: `completo-${suffix}@example.com`,
      name: `Completo ${suffix}`,
      planType: "pro",
      profile: {
        create: { city: "Sao Paulo", country: "BR", headline: "Dev" },
      },
      resumes: {
        create: [
          { isMaster: true, kind: "master", status: "reviewed", title: "CV master" },
          { isMaster: false, kind: "master", status: "draft", title: "CV base" },
          {
            isMaster: false,
            kind: "adapted",
            status: "uploaded",
            targetJobTitle: "Vaga Teste",
            title: "CV adaptado",
          },
        ],
      },
    },
  });

  async function cleanup() {
    await database.resume.deleteMany({
      where: {
        userId: {
          in: [userAusente.id, userIncompleto.id, userSemMaster.id, userCompleto.id],
        },
      },
    });
    await database.userProfile.deleteMany({
      where: {
        userId: {
          in: [userAusente.id, userIncompleto.id, userSemMaster.id, userCompleto.id],
        },
      },
    });
    await database.user.deleteMany({
      where: {
        id: {
          in: [
            staffUser.id,
            userAusente.id,
            userIncompleto.id,
            userSemMaster.id,
            userCompleto.id,
          ],
        },
      },
    });
    await moduleRef.close();
  }

  return {
    cleanup,
    service,
    suffix,
    userAusente,
    userCompleto,
    userIncompleto,
    userSemMaster,
  };
}

test("AdminUsersService.list excludes staff users and paginates non-staff results", async () => {
  const fixture = await buildFixture();

  try {
    const page1 = await fixture.service.list({
      limit: 2,
      page: 1,
      query: fixture.suffix,
    });
    assert.equal(page1.total, 4);
    assert.equal(page1.users.length, 2);

    const page2 = await fixture.service.list({
      limit: 2,
      page: 2,
      query: fixture.suffix,
    });
    assert.equal(page2.users.length, 2);

    const allIds = [...page1.users, ...page2.users].map((u) => u.id).sort();
    assert.deepEqual(
      allIds,
      [
        fixture.userAusente.id,
        fixture.userIncompleto.id,
        fixture.userSemMaster.id,
        fixture.userCompleto.id,
      ].sort(),
    );
  } finally {
    await fixture.cleanup();
  }
});

test("AdminUsersService.list filters by completeness status: perfil ausente / incompleto / sem cv master / completo", async () => {
  const fixture = await buildFixture();

  try {
    const ausente = await fixture.service.list({
      query: fixture.suffix,
      status: "perfil ausente",
    });
    assert.deepEqual(
      ausente.users.map((u) => u.id),
      [fixture.userAusente.id],
    );

    const incompleto = await fixture.service.list({
      query: fixture.suffix,
      status: "perfil incompleto",
    });
    assert.deepEqual(
      incompleto.users.map((u) => u.id),
      [fixture.userIncompleto.id],
    );

    const semMaster = await fixture.service.list({
      query: fixture.suffix,
      status: "sem cv master",
    });
    assert.deepEqual(
      semMaster.users.map((u) => u.id),
      [fixture.userSemMaster.id],
    );

    const completo = await fixture.service.list({
      query: fixture.suffix,
      status: "completo",
    });
    assert.deepEqual(
      completo.users.map((u) => u.id),
      [fixture.userCompleto.id],
    );
  } finally {
    await fixture.cleanup();
  }
});

test("AdminUsersService.list filters by planType", async () => {
  const fixture = await buildFixture();

  try {
    const proUsers = await fixture.service.list({
      planType: "pro",
      query: fixture.suffix,
    });
    const proIds = proUsers.users.map((u) => u.id).sort();
    assert.deepEqual(
      proIds,
      [fixture.userSemMaster.id, fixture.userCompleto.id].sort(),
    );
  } finally {
    await fixture.cleanup();
  }
});

test("AdminUsersService.listResumes filters by derived kind (master/base/adapted) and status", async () => {
  const fixture = await buildFixture();

  try {
    const master = await fixture.service.listResumes({
      kind: "master",
      query: fixture.suffix,
    });
    assert.equal(master.total, 1);
    assert.equal(master.resumes[0]?.title, "CV master");

    const base = await fixture.service.listResumes({
      kind: "base",
      query: fixture.suffix,
    });
    assert.equal(base.total, 1);
    assert.equal(base.resumes[0]?.title, "CV base");

    const adapted = await fixture.service.listResumes({
      kind: "adapted",
      query: fixture.suffix,
    });
    assert.equal(adapted.total, 1);
    assert.equal(adapted.resumes[0]?.title, "CV adaptado");

    const draftOnly = await fixture.service.listResumes({
      query: fixture.suffix,
      status: "draft",
    });
    assert.equal(draftOnly.total, 1);
    assert.equal(draftOnly.resumes[0]?.title, "CV base");
  } finally {
    await fixture.cleanup();
  }
});
