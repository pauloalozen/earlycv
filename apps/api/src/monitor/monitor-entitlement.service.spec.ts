import assert from "node:assert/strict";
import { test } from "node:test";

import { MonitorEntitlementService } from "./monitor-entitlement.service";

type UserRow = { id: string; internalRole: string };

function buildDatabase(users: UserRow[]) {
  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        return users.find((user) => user.id === where.id) ?? null;
      },
    },
  } as never;
}

// Lançamento pra base inteira (decisão de 2026-09-10, Paulo): ghost mode
// encerrado, canUseMonitor libera qualquer usuário autenticado real —
// "reason" continua distinguindo staff (internal_access) do resto
// (open_launch), só pra telemetria (monitor_access_type), nunca pra
// decidir `.allowed`.
test("canUseMonitor allows a regular user (open launch)", async () => {
  const service = new MonitorEntitlementService(
    buildDatabase([{ id: "user-1", internalRole: "none" }]),
  );

  const result = await service.canUseMonitor("user-1");

  assert.deepEqual(result, { allowed: true, reason: "open_launch" });
});

test("canUseMonitor allows admin/superadmin, still tagged internal_access for telemetry", async () => {
  const service = new MonitorEntitlementService(
    buildDatabase([
      { id: "admin-1", internalRole: "admin" },
      { id: "superadmin-1", internalRole: "superadmin" },
    ]),
  );

  const admin = await service.canUseMonitor("admin-1");
  const superadmin = await service.canUseMonitor("superadmin-1");

  assert.deepEqual(admin, { allowed: true, reason: "internal_access" });
  assert.deepEqual(superadmin, { allowed: true, reason: "internal_access" });
});

test("canUseMonitor denies an unknown userId (deleted/ghost id, not a real user)", async () => {
  const service = new MonitorEntitlementService(buildDatabase([]));

  const result = await service.canUseMonitor("ghost-user");

  assert.deepEqual(result, { allowed: false, reason: "none" });
});

test("filterEntitledUserIds returns every id it received (open launch, no filtering)", async () => {
  const service = new MonitorEntitlementService(buildDatabase([]));

  const result = await service.filterEntitledUserIds([
    "user-1",
    "admin-1",
    "user-2",
  ]);

  assert.deepEqual([...result].sort(), ["admin-1", "user-1", "user-2"].sort());
});

test("filterEntitledUserIds returns an empty set for an empty input, without erroring", async () => {
  const service = new MonitorEntitlementService(buildDatabase([]));

  const result = await service.filterEntitledUserIds([]);

  assert.equal(result.size, 0);
});
