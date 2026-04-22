import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { GUARDS_METADATA } from "@nestjs/common/constants";
import type { AuthenticatedRequestUser } from "../common/authenticated-user.decorator";
import { INTERNAL_ROLES_KEY } from "../common/roles.decorator";
import { AnalysisConfigController } from "./analysis-config.controller";
import type {
  AnalysisConfigBackofficeEntry,
  SetAnalysisConfigFromBackofficeInput,
} from "./analysis-config-backoffice.service";

type BackofficeServiceStub = {
  getBackofficeEntries: () => Promise<AnalysisConfigBackofficeEntry[]>;
  setFromBackoffice: (
    input: SetAnalysisConfigFromBackofficeInput,
  ) => Promise<AnalysisConfigBackofficeEntry>;
};

test("analysis config controller enforces admin/superadmin guards", () => {
  const guards =
    Reflect.getMetadata(GUARDS_METADATA, AnalysisConfigController) ?? [];
  const roles =
    Reflect.getMetadata(INTERNAL_ROLES_KEY, AnalysisConfigController) ?? [];

  assert.equal(Array.isArray(guards), true);
  assert.equal(guards.length >= 2, true);
  assert.deepEqual(roles, ["admin", "superadmin"]);
});

test("list returns config entries with source metadata", async () => {
  const controller = new AnalysisConfigController({
    getBackofficeEntries: async () => [
      {
        defaultValue: false,
        impactDescription: "Bloqueia analise imediatamente.",
        key: "kill_switch_enabled",
        max: undefined,
        min: undefined,
        origin: "default",
        risk: "high",
        type: "boolean",
        value: false,
      },
    ],
    setFromBackoffice: async () => {
      throw new Error("not called");
    },
  } satisfies BackofficeServiceStub as BackofficeServiceStub);

  const response = await controller.list();

  assert.equal(response.entries.length, 1);
  assert.equal(response.entries[0]?.key, "kill_switch_enabled");
  assert.equal(response.entries[0]?.origin, "default");
});

test("update forwards actor info and payload to service", async () => {
  let call: SetAnalysisConfigFromBackofficeInput | null = null;
  const controller = new AnalysisConfigController({
    getBackofficeEntries: async () => [],
    setFromBackoffice: async (input) => {
      call = input;

      return {
        defaultValue: 60,
        impactDescription: "Controla flood inicial por IP.",
        key: "rate_limit_raw_per_minute",
        max: 1000,
        min: 1,
        origin: "database",
        risk: "medium",
        type: "int",
        value: 100,
      };
    },
  } satisfies BackofficeServiceStub as BackofficeServiceStub);

  const actor: AuthenticatedRequestUser = {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    email: "staff@earlycv.dev",
    emailVerifiedAt: null,
    id: "staff-1",
    internalRole: "superadmin",
    isStaff: true,
    lastLoginAt: null,
    name: "Staff",
    planType: "free",
    status: "active",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const response = await controller.update(
    "rate_limit_raw_per_minute",
    {
      source: "ui",
      technicalContext: { panel: "superadmin" },
      value: "100",
    },
    actor,
  );

  assert.equal(call?.actor.id, "staff-1");
  assert.equal(call?.key, "rate_limit_raw_per_minute");
  assert.equal(call?.value, "100");
  assert.equal(response.entry.origin, "database");
});
