import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalizeSourceUrl } from "./url-normalization";

test("canonicalizeSourceUrl removes query and hash and normalizes host", () => {
  assert.equal(
    canonicalizeSourceUrl("HTTPS://Example.com/careers/?utm=1#open"),
    "https://example.com/careers",
  );
});
