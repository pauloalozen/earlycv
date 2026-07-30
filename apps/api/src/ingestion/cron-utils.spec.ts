import assert from "node:assert/strict";
import { test } from "node:test";

import {
  doesCronMatchDate,
  doesSecondsCronMatchDate,
  isCronExpressionValid,
  isSecondsCronExpressionValid,
} from "./cron-utils";

test("isCronExpressionValid accepts simple patterns", () => {
  assert.equal(isCronExpressionValid("*/15 * * * *"), true);
  assert.equal(isCronExpressionValid("bad expression"), false);
});

test("doesCronMatchDate matches minute and hour", () => {
  const date = new Date("2026-05-17T15:30:00.000Z");
  assert.equal(doesCronMatchDate("30 * * * *", date), true);
  assert.equal(doesCronMatchDate("31 * * * *", date), false);
});

test("isSecondsCronExpressionValid accepts 6-field patterns and rejects 5-field ones", () => {
  assert.equal(isSecondsCronExpressionValid("*/10 * * * * *"), true);
  assert.equal(isSecondsCronExpressionValid("*/15 * * * *"), false);
  assert.equal(isSecondsCronExpressionValid("bad expression"), false);
});

test("doesSecondsCronMatchDate matches on the step and gates by minute/hour too", () => {
  const dateOnStep = new Date("2026-05-17T15:30:20.000Z");
  const dateOffStep = new Date("2026-05-17T15:30:21.000Z");
  assert.equal(doesSecondsCronMatchDate("*/10 * * * * *", dateOnStep), true);
  assert.equal(doesSecondsCronMatchDate("*/10 * * * * *", dateOffStep), false);
  assert.equal(doesSecondsCronMatchDate("*/10 31 * * * *", dateOnStep), false);
});
