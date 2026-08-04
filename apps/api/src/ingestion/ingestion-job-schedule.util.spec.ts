import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addHours,
  calculateNextRunAt,
  nextDailyRun,
  nextWeeklyRun,
} from "./ingestion-job-schedule.util";

test("nextDailyRun retorna hoje quando o horario ainda nao passou (SP)", () => {
  // 2026-08-04 10:00 UTC = 07:00 em Sao Paulo (UTC-3)
  const from = new Date("2026-08-04T10:00:00.000Z");
  const next = nextDailyRun(from, 9, 0);
  assert.equal(next.toISOString(), "2026-08-04T12:00:00.000Z");
});

test("nextDailyRun avanca pro dia seguinte quando o horario ja passou (SP)", () => {
  // 2026-08-04 10:00 UTC = 07:00 em Sao Paulo
  const from = new Date("2026-08-04T10:00:00.000Z");
  const next = nextDailyRun(from, 7, 0);
  assert.equal(next.toISOString(), "2026-08-05T10:00:00.000Z");
});

test("addHours soma horas em ms diretamente", () => {
  const from = new Date("2026-08-04T10:00:00.000Z");
  const next = addHours(from, 2);
  assert.equal(next.toISOString(), "2026-08-04T12:00:00.000Z");
});

test("nextWeeklyRun encontra o proximo dia da semana permitido", () => {
  // 2026-08-04 e uma terca-feira (dayOfWeek 2) em SP
  const from = new Date("2026-08-04T10:00:00.000Z");
  // proxima sexta (5) as 07:00 SP
  const next = nextWeeklyRun(from, [5], 7, 0);
  assert.equal(next.toISOString(), "2026-08-07T10:00:00.000Z");
});

test("calculateNextRunAt MANUAL nunca agenda", () => {
  const from = new Date("2026-08-04T10:00:00.000Z");
  const result = calculateNextRunAt(
    {
      scheduleDaysOfWeek: [],
      scheduleHour: null,
      scheduleInterval: null,
      scheduleMinute: 0,
      scheduleType: "MANUAL",
    },
    from,
  );
  assert.equal(result, null);
});

test("calculateNextRunAt EVERY_N_HOURS delega para addHours", () => {
  const from = new Date("2026-08-04T10:00:00.000Z");
  const result = calculateNextRunAt(
    {
      scheduleDaysOfWeek: [],
      scheduleHour: null,
      scheduleInterval: 3,
      scheduleMinute: 0,
      scheduleType: "EVERY_N_HOURS",
    },
    from,
  );
  assert.equal(result?.toISOString(), "2026-08-04T13:00:00.000Z");
});
