import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isEveryNDaysDue,
  isFrequencyDueToday,
  isScheduledDailyMoment,
  isWeeklyDigestDay,
  scheduledForNow,
  startOfIsoWeekUtc,
  startOfUtcDay,
} from "./monitor-digest-schedule.util";

test("startOfUtcDay truncates to UTC midnight of the same date", () => {
  const now = new Date("2026-08-27T23:59:59.999Z");
  assert.equal(startOfUtcDay(now).toISOString(), "2026-08-27T00:00:00.000Z");
});

test("startOfIsoWeekUtc resolves to the Monday of the current ISO week for any weekday", () => {
  // 2026-08-27 é uma quinta-feira.
  const thursday = new Date("2026-08-27T15:00:00.000Z");
  assert.equal(
    startOfIsoWeekUtc(thursday).toISOString(),
    "2026-08-24T00:00:00.000Z",
  );

  // Domingo (getUTCDay()===0) precisa voltar 6 dias, não ficar parado.
  const sunday = new Date("2026-08-30T10:00:00.000Z");
  assert.equal(
    startOfIsoWeekUtc(sunday).toISOString(),
    "2026-08-24T00:00:00.000Z",
  );

  // A própria segunda-feira retorna ela mesma (à meia-noite).
  const monday = new Date("2026-08-24T18:00:00.000Z");
  assert.equal(
    startOfIsoWeekUtc(monday).toISOString(),
    "2026-08-24T00:00:00.000Z",
  );
});

test("isWeeklyDigestDay defaults to Mondays (UTC) when no weeklyDayOfWeek is given", () => {
  assert.equal(isWeeklyDigestDay(new Date("2026-08-24T12:00:00Z")), true);
  assert.equal(isWeeklyDigestDay(new Date("2026-08-25T12:00:00Z")), false);
  assert.equal(isWeeklyDigestDay(new Date("2026-08-30T12:00:00Z")), false);
});

test("isWeeklyDigestDay respects a configured weeklyDayOfWeek", () => {
  // 2026-08-26 é uma quarta-feira (UTC getUTCDay()===3).
  assert.equal(isWeeklyDigestDay(new Date("2026-08-26T12:00:00Z"), 3), true);
  assert.equal(isWeeklyDigestDay(new Date("2026-08-24T12:00:00Z"), 3), false);
});

test("isScheduledDailyMoment compares hour/minute in the configured timezone, not raw UTC", () => {
  const config = {
    dailyHour: 11,
    dailyMinute: 0,
    timezone: "America/Sao_Paulo",
  };
  // 14:00 UTC = 11:00 em America/Sao_Paulo (UTC-3).
  assert.equal(
    isScheduledDailyMoment(new Date("2026-08-27T14:00:00Z"), config),
    true,
  );
  assert.equal(
    isScheduledDailyMoment(new Date("2026-08-27T14:01:00Z"), config),
    false,
  );
  assert.equal(
    isScheduledDailyMoment(new Date("2026-08-27T11:00:00Z"), config),
    false,
  );
});

test("isScheduledDailyMoment reflects an edited dailyHour/dailyMinute", () => {
  const config = {
    dailyHour: 8,
    dailyMinute: 30,
    timezone: "America/Sao_Paulo",
  };
  assert.equal(
    isScheduledDailyMoment(new Date("2026-08-27T11:30:00Z"), config),
    true,
  );
});

test("isEveryNDaysDue is true on the anchor day itself and every Nth day after, false otherwise", () => {
  const anchor = new Date("2026-08-24T00:00:00Z");

  assert.equal(isEveryNDaysDue(new Date("2026-08-24T15:00:00Z"), anchor, 3), true);
  assert.equal(isEveryNDaysDue(new Date("2026-08-25T15:00:00Z"), anchor, 3), false);
  assert.equal(isEveryNDaysDue(new Date("2026-08-26T15:00:00Z"), anchor, 3), false);
  assert.equal(isEveryNDaysDue(new Date("2026-08-27T15:00:00Z"), anchor, 3), true);
});

test("isEveryNDaysDue treats a null anchor as today (first tick after enabling always fires)", () => {
  const today = new Date("2026-08-27T15:00:00Z");
  assert.equal(isEveryNDaysDue(today, null, 4), true);
});

test("isEveryNDaysDue is false for days before the anchor (never fires retroactively)", () => {
  const anchor = new Date("2026-08-27T00:00:00Z");
  assert.equal(isEveryNDaysDue(new Date("2026-08-26T15:00:00Z"), anchor, 2), false);
});

test("isFrequencyDueToday: DAILY is always due", () => {
  assert.equal(
    isFrequencyDueToday(new Date("2026-08-25T12:00:00Z"), {
      frequency: "DAILY",
      weeklyDayOfWeek: 1,
      intervalAnchorDate: null,
    }),
    true,
  );
});

test("isFrequencyDueToday: WEEKLY delegates to isWeeklyDigestDay", () => {
  const config = {
    frequency: "WEEKLY",
    weeklyDayOfWeek: 3,
    intervalAnchorDate: null,
  };
  // 2026-08-26 é uma quarta-feira.
  assert.equal(
    isFrequencyDueToday(new Date("2026-08-26T12:00:00Z"), config),
    true,
  );
  assert.equal(
    isFrequencyDueToday(new Date("2026-08-27T12:00:00Z"), config),
    false,
  );
});

test("isFrequencyDueToday: EVERY_2_DAYS/EVERY_3_DAYS/EVERY_4_DAYS delegate to isEveryNDaysDue with the right interval", () => {
  const anchor = new Date("2026-08-24T00:00:00Z");
  assert.equal(
    isFrequencyDueToday(new Date("2026-08-26T12:00:00Z"), {
      frequency: "EVERY_2_DAYS",
      weeklyDayOfWeek: 1,
      intervalAnchorDate: anchor,
    }),
    true,
  );
  assert.equal(
    isFrequencyDueToday(new Date("2026-08-25T12:00:00Z"), {
      frequency: "EVERY_2_DAYS",
      weeklyDayOfWeek: 1,
      intervalAnchorDate: anchor,
    }),
    false,
  );
});

test("scheduledForNow: WEEKLY uses the Monday of the ISO week, everything else uses the current UTC day", () => {
  // 2026-08-27 é uma quinta-feira.
  const thursday = new Date("2026-08-27T15:00:00Z");
  assert.equal(
    scheduledForNow(thursday, "WEEKLY").toISOString(),
    "2026-08-24T00:00:00.000Z",
  );
  assert.equal(
    scheduledForNow(thursday, "DAILY").toISOString(),
    "2026-08-27T00:00:00.000Z",
  );
  assert.equal(
    scheduledForNow(thursday, "EVERY_3_DAYS").toISOString(),
    "2026-08-27T00:00:00.000Z",
  );
});
