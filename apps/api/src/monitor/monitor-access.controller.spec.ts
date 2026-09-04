import assert from "node:assert/strict";
import { test } from "node:test";

import { MonitorAccessController } from "./monitor-access.controller";

test("returns whatever the entitlement service decides for the authenticated user, unmodified", async () => {
  const entitlementService = {
    canUseMonitor: async (userId: string) => ({
      allowed: true,
      reason: "internal_access" as const,
      checkedUserId: userId,
    }),
  };
  const controller = new MonitorAccessController(entitlementService as never);

  const result = await controller.getAccess({ id: "user-1" } as never);

  assert.deepEqual(result, {
    allowed: true,
    reason: "internal_access",
    checkedUserId: "user-1",
  });
});

test("propagates a denied result as-is — the controller makes no access decision itself", async () => {
  const entitlementService = {
    canUseMonitor: async () => ({ allowed: false, reason: "none" as const }),
  };
  const controller = new MonitorAccessController(entitlementService as never);

  const result = await controller.getAccess({ id: "user-1" } as never);

  assert.deepEqual(result, { allowed: false, reason: "none" });
});
