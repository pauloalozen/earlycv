import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldSkipDetailFetch } from "./dedup-policy";

test("shouldSkipDetailFetch returns true for lastSeenAt within 24 hours", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  const freshLastSeenAt = new Date("2026-06-10T11:00:00.000Z");

  assert.equal(shouldSkipDetailFetch(freshLastSeenAt, now), true);
});

test("shouldSkipDetailFetch returns false for lastSeenAt older than 24 hours", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  const staleLastSeenAt = new Date("2026-06-09T11:59:00.000Z");

  assert.equal(shouldSkipDetailFetch(staleLastSeenAt, now), false);
});

test("shouldSkipDetailFetch returns false for much older lastSeenAt", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  const staleLastSeenAt = new Date("2026-06-08T12:00:00.000Z");

  assert.equal(shouldSkipDetailFetch(staleLastSeenAt, now), false);
});

test("shouldSkipDetailFetch returns false for null lastSeenAt", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");

  assert.equal(shouldSkipDetailFetch(null, now), false);
});

test("shouldSkipDetailFetch returns false for undefined lastSeenAt", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");

  assert.equal(shouldSkipDetailFetch(undefined, now), false);
});
