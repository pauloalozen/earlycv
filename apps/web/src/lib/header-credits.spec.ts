import assert from "node:assert/strict";
import { test } from "node:test";

import { toHeaderAvailableCredits } from "./header-credits";

test("toHeaderAvailableCredits returns em dash when plan is unavailable", () => {
  assert.equal(toHeaderAvailableCredits(null), "—");
});

test("toHeaderAvailableCredits returns infinity for unlimited plan", () => {
  assert.equal(toHeaderAvailableCredits({ creditsRemaining: null }), "∞");
});

test("toHeaderAvailableCredits returns numeric credits for finite plan", () => {
  assert.equal(toHeaderAvailableCredits({ creditsRemaining: 7 }), 7);
  assert.equal(toHeaderAvailableCredits({ creditsRemaining: 0 }), 0);
});
