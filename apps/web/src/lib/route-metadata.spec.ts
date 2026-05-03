import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAdminMetadata, buildSuperadminMetadata } from "./route-metadata";

test("buildAdminMetadata returns noindex metadata with formatted title", () => {
  const metadata = buildAdminMetadata("Pagamentos");

  assert.equal(metadata.title, "Admin • Pagamentos | EarlyCV");
  assert.deepEqual(metadata.robots, { follow: false, index: false });
});

test("buildSuperadminMetadata returns noindex metadata with formatted title", () => {
  const metadata = buildSuperadminMetadata("Equipe");

  assert.equal(metadata.title, "Superadmin • Equipe | EarlyCV");
  assert.deepEqual(metadata.robots, { follow: false, index: false });
});
