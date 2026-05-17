import assert from "node:assert/strict";
import { test } from "node:test";

import { doesCronMatchDate, isCronExpressionValid } from "./cron-utils";

test("isCronExpressionValid accepts simple patterns", () => {
  assert.equal(isCronExpressionValid("*/15 * * * *"), true);
  assert.equal(isCronExpressionValid("bad expression"), false);
});

test("doesCronMatchDate matches minute and hour", () => {
  const date = new Date("2026-05-17T15:30:00.000Z");
  assert.equal(doesCronMatchDate("30 * * * *", date), true);
  assert.equal(doesCronMatchDate("31 * * * *", date), false);
});
