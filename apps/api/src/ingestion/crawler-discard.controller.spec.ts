import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { GUARDS_METADATA } from "@nestjs/common/constants";
import { INTERNAL_ROLES_KEY } from "../common/roles.decorator";
import { CrawlerDiscardController } from "./crawler-discard.controller";

test("crawler discard controller enforces admin/superadmin guards", () => {
  const guards =
    Reflect.getMetadata(GUARDS_METADATA, CrawlerDiscardController) ?? [];
  const roles =
    Reflect.getMetadata(INTERNAL_ROLES_KEY, CrawlerDiscardController) ?? [];

  assert.equal(Array.isArray(guards), true);
  assert.equal(guards.length >= 2, true);
  assert.deepEqual(roles, ["admin", "superadmin"]);
});

test("GET / delegates to service.list with query params", async () => {
  let receivedParams: unknown;
  const controller = new CrawlerDiscardController({
    list: async (params: unknown) => {
      receivedParams = params;
      return { page: 1, pageSize: 20, rows: [], total: 0, totalPages: 1 };
    },
  } as never);

  const result = await controller.list({
    filterReason: "noise_signal",
    page: 2,
  } as never);

  assert.deepEqual(receivedParams, { filterReason: "noise_signal", page: 2 });
  assert.deepEqual(result, {
    page: 1,
    pageSize: 20,
    rows: [],
    total: 0,
    totalPages: 1,
  });
});

test("POST /:id/whitelist delegates to service.whitelist with id and term", async () => {
  let receivedId = "";
  let receivedTerm = "";
  const controller = new CrawlerDiscardController({
    whitelist: async (id: string, term: string) => {
      receivedId = id;
      receivedTerm = term;
      return { id: "config-2", version: "v2" };
    },
  } as never);

  const result = await controller.whitelist("discard-1", {
    term: "governanca de ti",
  });

  assert.equal(receivedId, "discard-1");
  assert.equal(receivedTerm, "governanca de ti");
  assert.deepEqual(result, { id: "config-2", version: "v2" });
});
