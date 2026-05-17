import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeCompanyName } from "./name-normalization";

test("normalizeCompanyName is deterministic", () => {
  assert.equal(normalizeCompanyName("  ÁCME   Labs "), "acme-labs");
  assert.equal(normalizeCompanyName("ACME Labs"), "acme-labs");
});
