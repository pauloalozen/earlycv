import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasAvailableAnalysisCredits,
  hasAvailableCredits,
} from "./plan-credits.ts";

test("hasAvailableCredits returns true for unlimited and positive credits", () => {
  assert.equal(
    hasAvailableCredits({
      creditsRemaining: null,
      analysisCreditsRemaining: 0,
    }),
    true,
  );
  assert.equal(
    hasAvailableCredits({ creditsRemaining: 1, analysisCreditsRemaining: 0 }),
    true,
  );
});

test("hasAvailableCredits returns false for no plan or zero credits", () => {
  assert.equal(hasAvailableCredits(null), false);
  assert.equal(
    hasAvailableCredits({ creditsRemaining: 0, analysisCreditsRemaining: 0 }),
    false,
  );
});

test("hasAvailableAnalysisCredits respects null and positive values", () => {
  assert.equal(
    hasAvailableAnalysisCredits({
      creditsRemaining: 0,
      analysisCreditsRemaining: null,
    }),
    true,
  );
  assert.equal(
    hasAvailableAnalysisCredits({
      creditsRemaining: 0,
      analysisCreditsRemaining: 1,
    }),
    true,
  );
  assert.equal(
    hasAvailableAnalysisCredits({
      creditsRemaining: 0,
      analysisCreditsRemaining: 0,
    }),
    false,
  );
  assert.equal(hasAvailableAnalysisCredits(null), false);
});
