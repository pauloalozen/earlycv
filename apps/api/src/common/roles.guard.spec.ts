import assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { InternalRoles } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";

// Cobre o guard compartilhado por TODOS os controllers admin (incluindo
// AdminMonitorController) — testado uma vez aqui em vez de duplicado por
// controller.
class FakeHandlerTarget {
  @InternalRoles("admin", "superadmin")
  gatedMethod() {}

  ungatedMethod() {}
}

function buildContext(
  user: { isStaff: boolean; internalRole: string } | undefined,
  handlerName: "gatedMethod" | "ungatedMethod" = "gatedMethod",
) {
  const target = new FakeHandlerTarget();
  return {
    getHandler: () => target[handlerName],
    getClass: () => FakeHandlerTarget,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

test("allows an admin through a role-gated route", () => {
  const guard = new RolesGuard(new Reflector());

  const result = guard.canActivate(
    buildContext({ isStaff: true, internalRole: "admin" }),
  );

  assert.equal(result, true);
});

test("allows a superadmin through a route gated for admin+superadmin", () => {
  const guard = new RolesGuard(new Reflector());

  const result = guard.canActivate(
    buildContext({ isStaff: true, internalRole: "superadmin" }),
  );

  assert.equal(result, true);
});

test("throws ForbiddenException for a regular (non-staff) user", () => {
  const guard = new RolesGuard(new Reflector());

  assert.throws(
    () =>
      guard.canActivate(buildContext({ isStaff: false, internalRole: "none" })),
    ForbiddenException,
  );
});

test("throws ForbiddenException for staff with internalRole=none", () => {
  const guard = new RolesGuard(new Reflector());

  assert.throws(
    () =>
      guard.canActivate(buildContext({ isStaff: true, internalRole: "none" })),
    ForbiddenException,
  );
});

test("throws ForbiddenException when there is no authenticated user on the request", () => {
  const guard = new RolesGuard(new Reflector());

  assert.throws(
    () => guard.canActivate(buildContext(undefined)),
    ForbiddenException,
  );
});

test("allows any authenticated request through a route with no @InternalRoles at all", () => {
  const guard = new RolesGuard(new Reflector());

  const result = guard.canActivate(
    buildContext({ isStaff: false, internalRole: "none" }, "ungatedMethod"),
  );

  assert.equal(result, true);
});
