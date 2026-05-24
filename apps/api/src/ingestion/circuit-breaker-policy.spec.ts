import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CIRCUIT_BREAKER_403_THRESHOLD,
  CIRCUIT_BREAKER_PAUSE_HOURS,
  evaluate403CircuitBreaker,
} from "./circuit-breaker-policy";

test("evaluate403CircuitBreaker increments consecutive 403 count", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  const result = evaluate403CircuitBreaker({
    event: "error_403",
    now,
    previousConsecutive403Count: 1,
    previousPauseReason: null,
    previousPausedUntil: null,
  });

  assert.equal(result.consecutive403Count, 2);
  assert.equal(result.pauseTriggered, false);
  assert.equal(result.pausedUntil, null);
});

test("evaluate403CircuitBreaker pauses source when threshold is reached", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  const result = evaluate403CircuitBreaker({
    event: "error_403",
    now,
    previousConsecutive403Count: CIRCUIT_BREAKER_403_THRESHOLD - 1,
    previousPauseReason: null,
    previousPausedUntil: null,
  });

  assert.equal(result.pauseTriggered, true);
  assert.equal(result.consecutive403Count, CIRCUIT_BREAKER_403_THRESHOLD);
  assert.equal(
    result.pausedUntil?.toISOString(),
    new Date(
      now.getTime() + CIRCUIT_BREAKER_PAUSE_HOURS * 60 * 60 * 1000,
    ).toISOString(),
  );
  assert.equal(result.pauseReason, "gupy_403_circuit_breaker");
});

test("evaluate403CircuitBreaker resets pause state after successful run", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  const result = evaluate403CircuitBreaker({
    event: "success",
    now,
    previousConsecutive403Count: 3,
    previousPauseReason: "gupy_403_circuit_breaker",
    previousPausedUntil: new Date("2026-06-10T18:00:00.000Z"),
  });

  assert.equal(result.consecutive403Count, 0);
  assert.equal(result.pauseTriggered, false);
  assert.equal(result.pausedUntil, null);
  assert.equal(result.pauseReason, null);
});

test("evaluate403CircuitBreaker keeps current state on non-403 errors", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  const existingPause = new Date("2026-06-10T18:00:00.000Z");
  const result = evaluate403CircuitBreaker({
    event: "error_other",
    now,
    previousConsecutive403Count: 2,
    previousPauseReason: "gupy_403_circuit_breaker",
    previousPausedUntil: existingPause,
  });

  assert.equal(result.consecutive403Count, 2);
  assert.equal(result.pauseTriggered, false);
  assert.equal(result.pausedUntil, existingPause);
  assert.equal(result.pauseReason, "gupy_403_circuit_breaker");
});
