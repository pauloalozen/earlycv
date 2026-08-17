import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { GUARDS_METADATA } from "@nestjs/common/constants";
import { INTERNAL_ROLES_KEY } from "../common/roles.decorator";
import { JobSourcesController } from "./job-sources.controller";

test("job sources controller enforces admin/superadmin guards", () => {
  const guards =
    Reflect.getMetadata(GUARDS_METADATA, JobSourcesController) ?? [];
  const roles =
    Reflect.getMetadata(INTERNAL_ROLES_KEY, JobSourcesController) ?? [];

  assert.equal(Array.isArray(guards), true);
  assert.equal(guards.length >= 2, true);
  assert.deepEqual(roles, ["admin", "superadmin"]);
});

test("PATCH bulk-schedule delegates to the service and returns the update count", async () => {
  let received: unknown;
  const controller = new JobSourcesController(
    {
      bulkUpdateSchedule: async (dto: unknown) => {
        received = dto;
        return { count: 164, scheduleEnabled: false, sourceType: "gupy" };
      },
    } as never,
    {} as never,
  );

  const result = await controller.bulkUpdateSchedule({
    sourceType: "gupy",
    scheduleEnabled: false,
  } as never);

  assert.deepEqual(received, { sourceType: "gupy", scheduleEnabled: false });
  assert.equal(result.count, 164);
  assert.equal(result.scheduleEnabled, false);
});

test("PATCH bulk-active delegates to the service and returns the update count", async () => {
  let received: unknown;
  const controller = new JobSourcesController(
    {
      bulkUpdateActive: async (dto: unknown) => {
        received = dto;
        return { count: 42, isActive: true, sourceType: "pandape" };
      },
    } as never,
    {} as never,
  );

  const result = await controller.bulkUpdateActive({
    sourceType: "pandape",
    isActive: true,
  } as never);

  assert.deepEqual(received, { sourceType: "pandape", isActive: true });
  assert.equal(result.count, 42);
  assert.equal(result.isActive, true);
});
