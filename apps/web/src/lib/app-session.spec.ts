import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type AppSessionUser,
  getDefaultAppRedirectPath,
  getRouteAccessRedirectPath,
  shouldMirrorBackofficeSession,
} from "./app-session";

function buildUser(overrides: Partial<AppSessionUser> = {}): AppSessionUser {
  return {
    id: "user-1",
    email: "user@earlycv.dev",
    name: "User",
    internalRole: "none",
    isStaff: false,
    emailVerifiedAt: new Date("2026-04-02T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

test("getDefaultAppRedirectPath sends unverified users to email verification", () => {
  assert.equal(
    getDefaultAppRedirectPath(buildUser({ emailVerifiedAt: null })),
    "/verificar-email",
  );
});

test("getDefaultAppRedirectPath sends verified staff to admin and common users to dashboard", () => {
  assert.equal(getDefaultAppRedirectPath(buildUser()), "/dashboard");
  assert.equal(
    getDefaultAppRedirectPath(
      buildUser({ internalRole: "admin", isStaff: true }),
    ),
    "/admin",
  );
  assert.equal(
    getDefaultAppRedirectPath(
      buildUser({ internalRole: "superadmin", isStaff: true }),
    ),
    "/admin",
  );
});

test("getRouteAccessRedirectPath protects admin and superadmin routes by verification and role", () => {
  assert.equal(getRouteAccessRedirectPath("/admin", null), "/entrar");
  assert.equal(
    getRouteAccessRedirectPath(
      "/dashboard",
      buildUser({ emailVerifiedAt: null }),
    ),
    "/verificar-email",
  );
  assert.equal(
    getRouteAccessRedirectPath("/superadmin", buildUser()),
    "/dashboard",
  );
  assert.equal(
    getRouteAccessRedirectPath(
      "/superadmin",
      buildUser({ internalRole: "admin", isStaff: true }),
    ),
    "/admin",
  );
  assert.equal(
    getRouteAccessRedirectPath(
      "/superadmin",
      buildUser({ internalRole: "superadmin", isStaff: true }),
    ),
    null,
  );
});

test("shouldMirrorBackofficeSession only for verified staff roles", () => {
  assert.equal(shouldMirrorBackofficeSession(buildUser()), false);
  assert.equal(
    shouldMirrorBackofficeSession(
      buildUser({
        emailVerifiedAt: null,
        internalRole: "superadmin",
        isStaff: true,
      }),
    ),
    false,
  );
  assert.equal(
    shouldMirrorBackofficeSession(
      buildUser({ internalRole: "admin", isStaff: true }),
    ),
    true,
  );
  assert.equal(
    shouldMirrorBackofficeSession(
      buildUser({ internalRole: "superadmin", isStaff: true }),
    ),
    true,
  );
});
