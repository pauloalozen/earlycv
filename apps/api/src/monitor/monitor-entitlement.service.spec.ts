import assert from "node:assert/strict";
import { test } from "node:test";

import { MonitorEntitlementService } from "./monitor-entitlement.service";

test("canUseMonitor allows access under the launch policy (no billing implemented yet)", async () => {
  const service = new MonitorEntitlementService();

  const result = await service.canUseMonitor("user-1");

  assert.deepEqual(result, { allowed: true, reason: "launch_access" });
});

test("canUseMonitor allows any userId under the launch policy — the decision doesn't depend on the specific user", async () => {
  const service = new MonitorEntitlementService();

  const a = await service.canUseMonitor("user-a");
  const b = await service.canUseMonitor("user-b-completely-different");

  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true);
});

test("filterEntitledUserIds returns every provided id under the launch policy", async () => {
  const service = new MonitorEntitlementService();

  const result = await service.filterEntitledUserIds([
    "user-1",
    "user-2",
    "user-3",
  ]);

  assert.deepEqual([...result].sort(), ["user-1", "user-2", "user-3"]);
});

test("filterEntitledUserIds returns an empty set for an empty input, without erroring", async () => {
  const service = new MonitorEntitlementService();

  const result = await service.filterEntitledUserIds([]);

  assert.equal(result.size, 0);
});
