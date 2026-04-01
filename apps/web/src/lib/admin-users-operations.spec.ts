import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAdminUserState,
  buildAssistedSessionState,
  buildUserCompletenessStatus,
  buildUserPendingItems,
  buildUserProfileStatus,
  filterAdminUsers,
  getMasterResume,
  getResumeDisplayKind,
  getSuperadminNavItems,
} from "./admin-users-operations.ts";

test("buildUserCompletenessStatus returns perfil ausente when profile is missing", () => {
  assert.deepEqual(
    buildUserCompletenessStatus({
      hasMasterResume: false,
      hasProfile: false,
    }),
    {
      label: "perfil ausente",
      tone: "warning",
    },
  );
});

test("buildUserCompletenessStatus returns perfil incompleto when a profile exists but required fields are missing", () => {
  assert.deepEqual(
    buildUserCompletenessStatus({
      hasAnyProfile: true,
      hasMasterResume: false,
      hasProfile: false,
    }),
    {
      label: "perfil incompleto",
      tone: "warning",
    },
  );
});

test("buildUserCompletenessStatus returns sem cv master when profile exists but master resume is missing", () => {
  assert.deepEqual(
    buildUserCompletenessStatus({
      hasMasterResume: false,
      hasProfile: true,
    }),
    {
      label: "sem cv master",
      tone: "warning",
    },
  );
});

test("buildUserCompletenessStatus returns completo when profile and CV master exist", () => {
  assert.deepEqual(
    buildUserCompletenessStatus({
      hasMasterResume: true,
      hasProfile: true,
    }),
    {
      label: "completo",
      tone: "success",
    },
  );
});

test("buildAdminUserState treats nullable profile as perfil ausente input", () => {
  const userState = buildAdminUserState({
    profile: null,
    resumes: [],
  });

  assert.deepEqual(buildUserProfileStatus(userState), {
    label: "perfil ausente",
    tone: "warning",
  });
  assert.deepEqual(buildUserCompletenessStatus(userState), {
    label: "perfil ausente",
    tone: "warning",
  });
});

test("buildAdminUserState treats partially filled profiles as perfil incompleto input", () => {
  const userState = buildAdminUserState({
    profile: {
      city: null,
      country: "Brazil",
      headline: "Platform Engineer",
    },
    resumes: [
      {
        id: "resume_1",
        isMaster: true,
        kind: "master",
        status: "reviewed",
        title: "CV master",
      },
    ],
  });

  assert.deepEqual(buildUserProfileStatus(userState), {
    label: "perfil incompleto",
    tone: "warning",
  });
  assert.deepEqual(buildUserCompletenessStatus(userState), {
    label: "perfil incompleto",
    tone: "warning",
  });
});

test("buildAssistedSessionState falls back to assisted-session query params", () => {
  assert.deepEqual(
    buildAssistedSessionState(
      null,
      {
        banner: "Sessao assistida iniciada",
        mode: "assisted",
        operatorUserId: "usr_admin",
        reason: "Apoio manual no fluxo",
        targetUserId: "usr_target",
      },
      "usr_target",
    ),
    {
      banner: "Sessao assistida iniciada",
      mode: "assisted",
      operatorUserId: "usr_admin",
      reason: "Apoio manual no fluxo",
      targetUserId: "usr_target",
    },
  );
});

test("buildUserPendingItems includes profile continuity gaps and missing master resume", () => {
  assert.deepEqual(
    buildUserPendingItems({
      users: [
        {
          id: "usr_1",
          name: "Ana Silva",
          profile: null,
          resumes: [],
        },
        {
          id: "usr_2",
          name: "Bruna Costa",
          profile: {
            city: null,
            country: "Brazil",
            headline: "Designer de Produto",
          },
          resumes: [],
        },
        {
          id: "usr_3",
          name: "Caio Lima",
          profile: {
            city: "Sao Paulo",
            country: "Brazil",
            headline: "Product Manager",
          },
          resumes: [],
        },
      ],
    }).map((item) => ({
      entityId: item.entityId,
      type: item.type,
    })),
    [
      { entityId: "usr_1", type: "user-missing-profile" },
      { entityId: "usr_2", type: "user-incomplete-profile" },
      { entityId: "usr_3", type: "user-missing-master-resume" },
    ],
  );
});

test("filterAdminUsers matches the user id in query searches", () => {
  const users = [
    {
      completenessStatus: { label: "completo", tone: "success" as const },
      email: "ana@earlycv.test",
      id: "user_123",
      name: "Ana Silva",
      planType: "free" as const,
      status: "active" as const,
    },
  ];

  assert.deepEqual(filterAdminUsers(users, { query: "123" }), users);
});

test("getMasterResume ignores generic base resumes that are not selected as master", () => {
  assert.equal(
    getMasterResume([
      {
        id: "resume_base",
        isMaster: false,
        kind: "master",
        status: "reviewed",
        title: "CV base alternativo",
      },
      {
        id: "resume_adapted",
        isMaster: false,
        kind: "adapted",
        status: "uploaded",
        title: "CV adaptado",
      },
    ]),
    null,
  );
});

test("getResumeDisplayKind separates selected master from base and adapted resumes", () => {
  assert.equal(
    getResumeDisplayKind({ isMaster: true, kind: "master" }),
    "master",
  );
  assert.equal(
    getResumeDisplayKind({ isMaster: false, kind: "master" }),
    "base",
  );
  assert.equal(
    getResumeDisplayKind({ isMaster: false, kind: "adapted" }),
    "adapted",
  );
});

test("getSuperadminNavItems returns the initial superadmin navigation labels", () => {
  assert.deepEqual(
    getSuperadminNavItems().map((item) => item.label),
    ["Visao geral", "Equipe", "Configuracoes", "Correcoes", "Suporte"],
  );
});

test("buildBackofficeHref returns the clean backoffice route", async () => {
  const { buildBackofficeHref } = await import("./admin-users-operations.ts");

  assert.equal(buildBackofficeHref("/admin/runs"), "/admin/runs");
});
