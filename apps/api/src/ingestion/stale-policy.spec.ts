import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getStaleCutoff,
  STALE_FALLBACK_DAYS,
  STALE_MIN_ABSENCE_HOURS,
  shouldMarkJobAsStale,
} from "./stale-policy";

const now = new Date("2026-06-10T12:00:00.000Z");

test("getStaleCutoff uses the previous completed run start when it is older than 24h", () => {
  const previous = new Date("2026-06-09T08:00:00.000Z");

  const cutoff = getStaleCutoff({
    now,
    observationCount: 10,
    previousCompletedRunStartedAt: previous,
  });

  assert.equal(cutoff.toISOString(), previous.toISOString());
  assert.equal(STALE_MIN_ABSENCE_HOURS, 24);
});

test("getStaleCutoff never goes below 24h of absence for frequently crawled sources", () => {
  const cutoff = getStaleCutoff({
    now,
    observationCount: 10,
    previousCompletedRunStartedAt: new Date("2026-06-10T11:00:00.000Z"),
  });

  assert.equal(cutoff.toISOString(), "2026-06-09T12:00:00.000Z");
});

test("getStaleCutoff falls back to 7 days without a previous completed run", () => {
  const cutoff = getStaleCutoff({
    now,
    observationCount: 10,
    previousCompletedRunStartedAt: null,
  });

  assert.equal(cutoff.toISOString(), "2026-06-03T12:00:00.000Z");
  assert.equal(STALE_FALLBACK_DAYS, 7);
});

test("getStaleCutoff falls back to 7 days when the run returned no observations", () => {
  const cutoff = getStaleCutoff({
    now,
    observationCount: 0,
    previousCompletedRunStartedAt: new Date("2026-06-09T08:00:00.000Z"),
  });

  assert.equal(cutoff.toISOString(), "2026-06-03T12:00:00.000Z");
});

test("daily crawl: a job missing from two consecutive runs is inactivated on the second", () => {
  // Visto na execução do dia 8, ausente nas dos dias 9 e 10.
  const lastSeenAt = new Date("2026-06-08T12:00:30.000Z");
  const cutoff = getStaleCutoff({
    now: new Date("2026-06-10T12:05:00.000Z"),
    observationCount: 10,
    previousCompletedRunStartedAt: new Date("2026-06-09T12:00:00.000Z"),
  });

  assert.equal(shouldMarkJobAsStale({ lastSeenAt }, cutoff), true);
});

test("daily crawl: a job missing from only the current run stays active", () => {
  // Visto na execução do dia 9 (anterior), ausente só na do dia 10.
  const lastSeenAt = new Date("2026-06-09T12:00:30.000Z");
  const cutoff = getStaleCutoff({
    now: new Date("2026-06-10T12:05:00.000Z"),
    observationCount: 10,
    previousCompletedRunStartedAt: new Date("2026-06-09T12:00:00.000Z"),
  });

  assert.equal(shouldMarkJobAsStale({ lastSeenAt }, cutoff), false);
});

test("shouldMarkJobAsStale marks only jobs strictly older than cutoff", () => {
  const cutoff = new Date("2026-05-25T12:00:00.000Z");

  assert.equal(
    shouldMarkJobAsStale(
      { lastSeenAt: new Date("2026-05-20T12:00:00.000Z") },
      cutoff,
    ),
    true,
  );
  assert.equal(
    shouldMarkJobAsStale(
      { lastSeenAt: new Date("2026-05-25T12:00:00.000Z") },
      cutoff,
    ),
    false,
  );
});
