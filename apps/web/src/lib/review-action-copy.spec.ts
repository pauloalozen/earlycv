import assert from "node:assert/strict";
import { test } from "node:test";

import { getReviewActionCopy } from "./review-action-copy";

test("getReviewActionCopy returns default label when idle", () => {
  assert.equal(getReviewActionCopy(false), "Rever analise");
});

test("getReviewActionCopy returns loading label when navigating", () => {
  assert.equal(getReviewActionCopy(true), "Abrindo analise...");
});
