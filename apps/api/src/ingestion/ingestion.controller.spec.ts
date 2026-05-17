import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { GUARDS_METADATA } from "@nestjs/common/constants";
import type { AuthenticatedRequestUser } from "../common/authenticated-user.decorator";
import { INTERNAL_ROLES_KEY } from "../common/roles.decorator";
import { IngestionController } from "./ingestion.controller";

test("ingestion controller enforces admin/superadmin guards", () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, IngestionController) ?? [];
  const roles = Reflect.getMetadata(INTERNAL_ROLES_KEY, IngestionController) ?? [];

  assert.equal(Array.isArray(guards), true);
  assert.equal(guards.length >= 2, true);
  assert.deepEqual(roles, ["admin", "superadmin"]);
});

test("controller exposes manual ingestion endpoints", () => {
  const controller = new IngestionController(
    {
      getRunById: async () => null,
      listAllRuns: async () => [],
    } as never,
    {
      importCompanySourcesCsv: async () => ({}) as never,
    } as never,
    {
      getConfig: async () => ({}) as never,
      updateConfig: async () => ({}) as never,
    } as never,
    {
      runGlobalNow: async () => ({}) as never,
    } as never,
    {
      cancel: async () => ({}) as never,
      getRunById: async () => ({}) as never,
      listRunItems: async () => [],
      listRuns: async () => [],
      startAdapterRun: async () => ({}) as never,
    } as never,
  );

  assert.equal(typeof (controller as any).startManualAdapterRun, "function");
  assert.equal(typeof (controller as any).listManualRuns, "function");
  assert.equal(typeof (controller as any).getManualRunById, "function");
  assert.equal(typeof (controller as any).listManualRunItems, "function");
  assert.equal(typeof (controller as any).cancelManualRun, "function");
});

test("POST manual adapter run returns queued payload", async () => {
  const actor: AuthenticatedRequestUser = {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    email: "admin@earlycv.dev",
    emailVerifiedAt: null,
    id: "admin-1",
    internalRole: "admin",
    isStaff: true,
    lastLoginAt: null,
    name: "Admin",
    planType: "free",
    status: "active",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  let receivedAdapter = "";
  let receivedUserId = "";
  const queued = {
    batchRunId: "batch-1",
    status: "queued",
  } as const;

  const controller = new IngestionController(
    {
      getRunById: async () => null,
      listAllRuns: async () => [],
    } as never,
    {
      importCompanySourcesCsv: async () => ({}) as never,
    } as never,
    {
      getConfig: async () => ({}) as never,
      updateConfig: async () => ({}) as never,
    } as never,
    {
      runGlobalNow: async () => ({}) as never,
    } as never,
    {
      cancel: async () => ({}) as never,
      getRunById: async () => ({}) as never,
      listRunItems: async () => [],
      listRuns: async () => [],
      startAdapterRun: async (adapterType: string, requestedByUserId: string) => {
        receivedAdapter = adapterType;
        receivedUserId = requestedByUserId;
        return queued;
      },
    } as never,
  );

  const response = await controller.startManualAdapterRun(
    { adapterType: "gupy" },
    actor,
  );

  assert.equal(receivedAdapter, "gupy");
  assert.equal(receivedUserId, "admin-1");
  assert.equal(response.status, "queued");
  assert.equal(typeof response.batchRunId, "string");
});

test("cancel manual run returns run snapshot", async () => {
  const controller = new IngestionController(
    {
      getRunById: async () => null,
      listAllRuns: async () => [],
    } as never,
    {
      importCompanySourcesCsv: async () => ({}) as never,
    } as never,
    {
      getConfig: async () => ({}) as never,
      updateConfig: async () => ({}) as never,
    } as never,
    {
      runGlobalNow: async () => ({}) as never,
    } as never,
    {
      cancel: async (batchRunId: string) => ({
        id: batchRunId,
        status: "cancelling",
      }),
      getRunById: async () => ({}) as never,
      listRunItems: async () => [],
      listRuns: async () => [],
      startAdapterRun: async () => ({}) as never,
    } as never,
  );

  const response = await controller.cancelManualRun("batch-1");

  assert.equal(response.id, "batch-1");
  assert.equal(response.status, "cancelling");
});
