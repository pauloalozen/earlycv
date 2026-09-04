import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { MonitorEntitlementService } from "./monitor-entitlement.service";

type UserRow = { id: string; internalRole: string };

function buildDatabase(users: UserRow[]) {
  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        return users.find((user) => user.id === where.id) ?? null;
      },
      findMany: async ({
        where,
      }: {
        where: { id: { in: string[] }; internalRole: { in: string[] } };
      }) => {
        return users.filter(
          (user) =>
            where.id.in.includes(user.id) &&
            where.internalRole.in.includes(user.internalRole),
        );
      },
    },
  } as never;
}

let originalGhostMode: string | undefined;

beforeEach(() => {
  originalGhostMode = process.env.JOBS_GHOST_MODE;
});

afterEach(() => {
  if (originalGhostMode === undefined) {
    delete process.env.JOBS_GHOST_MODE;
  } else {
    process.env.JOBS_GHOST_MODE = originalGhostMode;
  }
});

test("canUseMonitor denies access when JOBS_GHOST_MODE is off — no commercial rule exists yet, default is closed", async () => {
  process.env.JOBS_GHOST_MODE = "false";
  const service = new MonitorEntitlementService(
    buildDatabase([{ id: "user-1", internalRole: "none" }]),
  );

  const result = await service.canUseMonitor("user-1");

  assert.deepEqual(result, { allowed: false, reason: "none" });
});

test("canUseMonitor allows admin/superadmin while JOBS_GHOST_MODE is on (ghost mode validation)", async () => {
  process.env.JOBS_GHOST_MODE = "true";
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

test("canUseMonitor denies a regular user even while JOBS_GHOST_MODE is on", async () => {
  process.env.JOBS_GHOST_MODE = "true";
  const service = new MonitorEntitlementService(
    buildDatabase([{ id: "user-1", internalRole: "none" }]),
  );

  const result = await service.canUseMonitor("user-1");

  assert.deepEqual(result, { allowed: false, reason: "none" });
});

test("canUseMonitor denies an unknown userId while JOBS_GHOST_MODE is on", async () => {
  process.env.JOBS_GHOST_MODE = "true";
  const service = new MonitorEntitlementService(buildDatabase([]));

  const result = await service.canUseMonitor("ghost-user");

  assert.deepEqual(result, { allowed: false, reason: "none" });
});

test("filterEntitledUserIds returns an empty set while JOBS_GHOST_MODE is off, regardless of role", async () => {
  process.env.JOBS_GHOST_MODE = "false";
  const service = new MonitorEntitlementService(
    buildDatabase([{ id: "admin-1", internalRole: "admin" }]),
  );

  const result = await service.filterEntitledUserIds(["admin-1"]);

  assert.equal(result.size, 0);
});

test("filterEntitledUserIds keeps only admin/superadmin ids while JOBS_GHOST_MODE is on", async () => {
  process.env.JOBS_GHOST_MODE = "true";
  const service = new MonitorEntitlementService(
    buildDatabase([
      { id: "admin-1", internalRole: "admin" },
      { id: "superadmin-1", internalRole: "superadmin" },
      { id: "user-1", internalRole: "none" },
    ]),
  );

  const result = await service.filterEntitledUserIds([
    "admin-1",
    "superadmin-1",
    "user-1",
  ]);

  assert.deepEqual([...result].sort(), ["admin-1", "superadmin-1"]);
});

test("filterEntitledUserIds returns an empty set for an empty input, without erroring", async () => {
  process.env.JOBS_GHOST_MODE = "true";
  const service = new MonitorEntitlementService(buildDatabase([]));

  const result = await service.filterEntitledUserIds([]);

  assert.equal(result.size, 0);
});
