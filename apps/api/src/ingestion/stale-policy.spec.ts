import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getStaleCutoff,
  STALE_THRESHOLD_DAYS,
  shouldMarkJobAsStale,
} from "./stale-policy";

test("getStaleCutoff returns now minus threshold days", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");

  const cutoff = getStaleCutoff(now);

  assert.equal(cutoff.toISOString(), "2026-05-25T12:00:00.000Z");
  assert.equal(STALE_THRESHOLD_DAYS, 7);
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
  assert.equal(
    shouldMarkJobAsStale(
      { lastSeenAt: new Date("2026-05-29T12:00:00.000Z") },
      cutoff,
    ),
    false,
  );
});
