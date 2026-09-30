import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { GUARDS_METADATA } from "@nestjs/common/constants";
import { INTERNAL_ROLES_KEY } from "../common/roles.decorator";
import { DashboardAdminController } from "./dashboard-admin.controller";

function fakeResponse() {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };
}

test("dashboard admin controller enforces admin/superadmin guards", () => {
  const guards =
    Reflect.getMetadata(GUARDS_METADATA, DashboardAdminController) ?? [];
  const roles =
    Reflect.getMetadata(INTERNAL_ROLES_KEY, DashboardAdminController) ?? [];

  assert.equal(Array.isArray(guards), true);
  assert.equal(guards.length >= 2, true);
  assert.deepEqual(roles, ["admin", "superadmin"]);
});

test("GET indexing-log returns the log rows from the service, defaulting limit to 50", async () => {
  let receivedLimit: number | undefined;
  const controller = new DashboardAdminController({
    getIndexingLog: async (limit: number) => {
      receivedLimit = limit;
      return [
        {
          id: "log-1",
          slug: "vaga-a",
          type: "URL_UPDATED",
          status: "SUCCESS",
          errorMsg: null,
          createdAt: "2026-08-12T10:00:00.000Z",
        },
      ];
    },
  } as never);

  const response = fakeResponse();
  const result = await controller.getIndexingLog(response as never);

  assert.equal(receivedLimit, 50);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.slug, "vaga-a");
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("GET indexing-log clamps limit to [1, 200] and passes through valid values", async () => {
  let receivedLimit: number | undefined;
  const controller = new DashboardAdminController({
    getIndexingLog: async (limit: number) => {
      receivedLimit = limit;
      return [];
    },
  } as never);

  await controller.getIndexingLog(fakeResponse() as never, "999");
  assert.equal(receivedLimit, 200);

  // "0" é falsy em JS — `Number.parseInt("0", 10) || 50` cai no default 50,
  // mesmo padrão já usado em outros controllers paginados do projeto (ex.:
  // page em public-jobs.controller.ts). Não é clamp pro piso 1, é "input
  // inválido vira default".
  await controller.getIndexingLog(fakeResponse() as never, "0");
  assert.equal(receivedLimit, 50);

  await controller.getIndexingLog(fakeResponse() as never, "10");
  assert.equal(receivedLimit, 10);
});
