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

test("DELETE bulk delegates to the service with the id list", async () => {
  let received: unknown;
  const controller = new JobSourcesController(
    {
      bulkDelete: async (dto: unknown) => {
        received = dto;
        return { count: 3 };
      },
    } as never,
    {} as never,
  );

  const result = await controller.bulkDelete({
    ids: ["a", "b", "c"],
  } as never);

  assert.deepEqual(received, { ids: ["a", "b", "c"] });
  assert.equal(result.count, 3);
});

test('DELETE :id passa removeJobs=true só quando o query param é a string "true"', async () => {
  let received: unknown;
  const controller = new JobSourcesController(
    {
      remove: async (id: string, removeJobs: boolean) => {
        received = { id, removeJobs };
        return { ok: true };
      },
    } as never,
    {} as never,
  );

  await controller.remove("src-1", "true");
  assert.deepEqual(received, { id: "src-1", removeJobs: true });

  await controller.remove("src-2", undefined);
  assert.deepEqual(received, { id: "src-2", removeJobs: false });

  await controller.remove("src-3", "1");
  assert.deepEqual(received, { id: "src-3", removeJobs: false });
});

test("GET check-url delegates to the service", async () => {
  let received: unknown;
  const controller = new JobSourcesController(
    {
      checkUrlAvailable: async (url: string) => {
        received = url;
        return {
          companyName: "RAIZEN S.A.",
          sourceName: "RAIZEN S.A. careers",
          taken: true,
        };
      },
    } as never,
    {} as never,
  );

  const result = await controller.checkUrlAvailable(
    "https://genteraizen.gupy.io",
  );

  assert.equal(received, "https://genteraizen.gupy.io");
  assert.equal(result.taken, true);
});

test("GET duplicates delegates to the service", async () => {
  const groups = [
    {
      count: 2,
      sourceType: "gupy",
      sourceUrl: "https://raizen.gupy.io/",
      sources: [],
    },
  ];
  const controller = new JobSourcesController(
    { findDuplicates: async () => groups } as never,
    {} as never,
  );

  const result = await controller.findDuplicates();

  assert.deepEqual(result, groups);
});
