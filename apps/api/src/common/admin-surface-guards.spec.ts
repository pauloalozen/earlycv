import assert from "node:assert/strict";
import { test } from "node:test";

import { GUARDS_METADATA } from "@nestjs/common/constants";

import { AdminProfilesController } from "../admin-profiles/admin-profiles.controller";
import { AdminResumesController } from "../admin-resumes/admin-resumes.controller";
import { AdminUsersController } from "../admin-users/admin-users.controller";
import { AnalysisConfigController } from "../analysis-protection/analysis-config.controller";
import { AdminEventsController } from "../analysis-observability/admin-events.controller";
import { CvUnlocksController } from "../cv-unlocks/cv-unlocks.controller";
import { PaymentsController } from "../payments/payments.controller";
import { SuperadminStaffController } from "../superadmin-staff/superadmin-staff.controller";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { INTERNAL_ROLES_KEY } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";

const adminControllers = [
  AdminUsersController,
  AdminResumesController,
  AdminProfilesController,
  AnalysisConfigController,
  AdminEventsController,
] as const;

test("admin controllers enforce JwtAuthGuard + RolesGuard + admin/superadmin roles", () => {
  for (const controller of adminControllers) {
    const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as
      | Array<new (...args: unknown[]) => unknown>
      | undefined;
    const roles = Reflect.getMetadata(INTERNAL_ROLES_KEY, controller) as
      | string[]
      | undefined;

    assert.ok(Array.isArray(guards));
    assert.ok(guards.includes(JwtAuthGuard));
    assert.ok(guards.includes(RolesGuard));
    assert.deepEqual(roles, ["admin", "superadmin"]);
  }
});

test("superadmin-staff controller enforces JwtAuthGuard + RolesGuard + superadmin role", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    SuperadminStaffController,
  ) as Array<new (...args: unknown[]) => unknown> | undefined;
  const roles = Reflect.getMetadata(
    INTERNAL_ROLES_KEY,
    SuperadminStaffController,
  ) as string[] | undefined;

  assert.ok(Array.isArray(guards));
  assert.ok(guards.includes(JwtAuthGuard));
  assert.ok(guards.includes(RolesGuard));
  assert.deepEqual(roles, ["superadmin"]);
});

test("payments admin endpoints enforce superadmin role and roles guard", () => {
  const methods = [
    "listPayments",
    "getPaymentDetail",
    "reconcileAll",
    "reconcileOne",
  ] as const;

  for (const method of methods) {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      PaymentsController.prototype[method],
    ) as Array<new (...args: unknown[]) => unknown> | undefined;
    const roles = Reflect.getMetadata(
      INTERNAL_ROLES_KEY,
      PaymentsController.prototype[method],
    ) as string[] | undefined;

    assert.ok(Array.isArray(guards));
    assert.ok(guards.includes(RolesGuard));
    assert.deepEqual(roles, ["superadmin"]);
  }
});

test("cv-unlocks admin list enforces superadmin role and roles guard", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    CvUnlocksController.prototype.listAdminUnlocks,
  ) as Array<new (...args: unknown[]) => unknown> | undefined;
  const roles = Reflect.getMetadata(
    INTERNAL_ROLES_KEY,
    CvUnlocksController.prototype.listAdminUnlocks,
  ) as string[] | undefined;

  assert.ok(Array.isArray(guards));
  assert.ok(guards.includes(RolesGuard));
  assert.deepEqual(roles, ["superadmin"]);
});
