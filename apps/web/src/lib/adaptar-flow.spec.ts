import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAdaptarMode } from "./adaptar-flow.ts";

test("buildAdaptarMode returns master when user has master resume", () => {
  assert.equal(buildAdaptarMode({ hasMasterResume: true }), "master");
});

test("buildAdaptarMode returns upload when user has no master resume", () => {
  assert.equal(buildAdaptarMode({ hasMasterResume: false }), "upload");
});
