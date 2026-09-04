import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isScheduledDailyMoment,
  isWeeklyDigestDay,
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
