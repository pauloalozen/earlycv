import assert from "node:assert/strict";
import { test } from "node:test";

import { startOfPacificDay } from "./indexing-quota";

test("startOfPacificDay: meia-noite do Pacífico, com e sem horário de verão", () => {
  // Outubro: horário de verão (PDT, UTC-7).
  assert.equal(
    startOfPacificDay(new Date("2026-10-09T15:00:00.000Z")).toISOString(),
    "2026-10-09T07:00:00.000Z",
  );
  // 02h UTC de 10/10 ainda é dia 09 no Pacífico.
  assert.equal(
    startOfPacificDay(new Date("2026-10-10T02:00:00.000Z")).toISOString(),
    "2026-10-09T07:00:00.000Z",
  );
  // Dezembro: horário padrão (PST, UTC-8).
  assert.equal(
    startOfPacificDay(new Date("2026-12-15T12:00:00.000Z")).toISOString(),
    "2026-12-15T08:00:00.000Z",
  );
});
