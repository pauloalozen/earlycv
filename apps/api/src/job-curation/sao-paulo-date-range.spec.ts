import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCurationDateRange } from "./sao-paulo-date-range";

test('period="today" uses São Paulo midnight (UTC-3), not UTC midnight', () => {
  // 2026-09-14 20:00 em São Paulo (UTC-3) == 2026-09-14 23:00 UTC — ainda o
  // mesmo dia em SP.
  const now = new Date("2026-09-14T23:00:00.000Z");
  const { gte, lt } = resolveCurationDateRange("today", undefined, now);

  assert.equal(gte.toISOString(), "2026-09-14T03:00:00.000Z");
  assert.equal(lt.toISOString(), "2026-09-15T03:00:00.000Z");
});

test('period="today" just after UTC midnight still resolves to the previous SP day', () => {
  // 2026-09-15 00:30 UTC == 2026-09-14 21:30 em São Paulo — ainda dia 14.
  const now = new Date("2026-09-15T00:30:00.000Z");
  const { gte, lt } = resolveCurationDateRange("today", undefined, now);

  assert.equal(gte.toISOString(), "2026-09-14T03:00:00.000Z");
  assert.equal(lt.toISOString(), "2026-09-15T03:00:00.000Z");
});

test('period="24h" is a rolling window ending exactly at "now"', () => {
  const now = new Date("2026-09-14T15:00:00.000Z");
  const { gte, lt } = resolveCurationDateRange("24h", undefined, now);

  assert.equal(gte.toISOString(), "2026-09-13T15:00:00.000Z");
  assert.equal(lt.getTime(), now.getTime());
});

test('period="date" resolves the São Paulo day boundaries for an arbitrary date, semi-open interval', () => {
  const { gte, lt } = resolveCurationDateRange("date", "2026-01-05");

  assert.equal(gte.toISOString(), "2026-01-05T03:00:00.000Z");
  assert.equal(lt.toISOString(), "2026-01-06T03:00:00.000Z");
  assert.ok(gte.getTime() < lt.getTime());
});

test('period="date" rejects a malformed date string', () => {
  assert.throws(() => resolveCurationDateRange("date", "05/01/2026"));
});

test('period="date" rejects a date without a "date" argument', () => {
  assert.throws(() => resolveCurationDateRange("date", undefined));
});

test('period="date" rejects a calendar date that does not exist', () => {
  assert.throws(() => resolveCurationDateRange("date", "2026-02-30"));
});
