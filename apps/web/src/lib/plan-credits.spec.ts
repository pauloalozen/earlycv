import assert from "node:assert/strict";
import { test } from "node:test";

import { hasAvailableCredits } from "./plan-credits";

test("hasAvailableCredits returns true for unlimited and positive credits", () => {
  assert.equal(hasAvailableCredits({ creditsRemaining: null }), true);
  assert.equal(hasAvailableCredits({ creditsRemaining: 1 }), true);
});

test("hasAvailableCredits returns false for no plan or zero credits", () => {
  assert.equal(hasAvailableCredits(null), false);
  assert.equal(hasAvailableCredits({ creditsRemaining: 0 }), false);
});
