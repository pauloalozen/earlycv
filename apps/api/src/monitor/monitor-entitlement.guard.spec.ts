import assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";

import { MonitorEntitlementGuard } from "./monitor-entitlement.guard";

function buildContext(user: { id: string } | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as never;
}

test("allows the request through when the entitlement service allows access", async () => {
  const entitlementService = {
    canUseMonitor: async () => ({ allowed: true, reason: "internal_access" }),
  };
  const guard = new MonitorEntitlementGuard(entitlementService as never);

  const result = await guard.canActivate(buildContext({ id: "user-1" }));

  assert.equal(result, true);
});

test("throws ForbiddenException when the entitlement service denies access", async () => {
  const entitlementService = {
    canUseMonitor: async () => ({ allowed: false, reason: "none" }),
  };
  const guard = new MonitorEntitlementGuard(entitlementService as never);

  await assert.rejects(
    () => guard.canActivate(buildContext({ id: "user-1" })),
    ForbiddenException,
  );
});

test("throws ForbiddenException when there is no authenticated user on the request (defensive — JwtAuthGuard should have already blocked this)", async () => {
  const entitlementService = {
    canUseMonitor: async () => ({ allowed: true, reason: "internal_access" }),
  };
  const guard = new MonitorEntitlementGuard(entitlementService as never);

  await assert.rejects(
    () => guard.canActivate(buildContext(undefined)),
    ForbiddenException,
  );
});

test("checks entitlement using the authenticated user's id, never a value from the request body/query", async () => {
  let checkedUserId: string | null = null;
  const entitlementService = {
    canUseMonitor: async (userId: string) => {
      checkedUserId = userId;
      return { allowed: true, reason: "internal_access" };
    },
  };
  const guard = new MonitorEntitlementGuard(entitlementService as never);

  await guard.canActivate(buildContext({ id: "user-from-jwt" }));

  assert.equal(checkedUserId, "user-from-jwt");
});
