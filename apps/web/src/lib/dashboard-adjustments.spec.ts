import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowAdjustmentsAction } from "./dashboard-adjustments";

test("shouldShowAdjustmentsAction returns true for released item with notes", () => {
  const visible = shouldShowAdjustmentsAction({
    canDownload: true,
    notes: "Resumo",
    scoreBefore: null,
    scoreFinal: null,
  });

  assert.equal(visible, true);
});

test("shouldShowAdjustmentsAction returns true for released item with scores", () => {
  const visible = shouldShowAdjustmentsAction({
    canDownload: true,
    notes: null,
    scoreBefore: 61,
    scoreFinal: 82,
  });

  assert.equal(visible, true);
});

test("shouldShowAdjustmentsAction returns false when not released", () => {
  const visible = shouldShowAdjustmentsAction({
    canDownload: false,
    notes: "Resumo",
    scoreBefore: 61,
    scoreFinal: 82,
  });

  assert.equal(visible, false);
});

test("shouldShowAdjustmentsAction returns false for released item without useful data", () => {
  const visible = shouldShowAdjustmentsAction({
    canDownload: true,
    notes: null,
    scoreBefore: null,
    scoreFinal: null,
  });

  assert.equal(visible, false);
});
