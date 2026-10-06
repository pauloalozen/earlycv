import assert from "node:assert/strict";
import test from "node:test";

import { resolveEmailWindow } from "./email-period";

// 2026-10-01 (quinta) 02:00 UTC = 2026-09-30 (quarta) 23:00 em São Paulo.
const NOW = new Date("2026-10-01T02:00:00Z");

test("hoje usa o dia de São Paulo, não o de UTC", () => {
  const w = resolveEmailWindow({ period: "hoje" }, NOW);
  assert.equal(w.fromDate, "2026-09-30");
  assert.equal(w.toDate, "2026-09-30");
  assert.equal(w.from.toISOString(), "2026-09-30T03:00:00.000Z");
  assert.equal(w.to.toISOString(), "2026-10-01T03:00:00.000Z");
});

test("semana começa na segunda", () => {
  const w = resolveEmailWindow({ period: "semana" }, NOW);
  assert.equal(w.fromDate, "2026-09-28");
  assert.equal(w.toDate, "2026-09-30");
});

test("semana num domingo volta 6 dias", () => {
  const w = resolveEmailWindow(
    { period: "semana" },
    new Date("2026-10-04T15:00:00Z"),
  );
  assert.equal(w.fromDate, "2026-09-28");
  assert.equal(w.toDate, "2026-10-04");
});

test("7d, 30d e mês atual", () => {
  assert.equal(
    resolveEmailWindow({ period: "7d" }, NOW).fromDate,
    "2026-09-24",
  );
  assert.equal(resolveEmailWindow({}, NOW).fromDate, "2026-09-01");
  assert.equal(
    resolveEmailWindow({ period: "mes" }, NOW).fromDate,
    "2026-09-01",
  );
  assert.equal(resolveEmailWindow({ period: "30d" }, NOW).period, "30d");
});

test("intervalo personalizado inclui o dia final inteiro", () => {
  const w = resolveEmailWindow({ from: "2026-09-10", to: "2026-09-12" }, NOW);
  assert.equal(w.period, "custom");
  assert.equal(w.from.toISOString(), "2026-09-10T03:00:00.000Z");
  assert.equal(w.to.toISOString(), "2026-09-13T03:00:00.000Z");
});

test("rejeita intervalo inválido", () => {
  for (const input of [
    { from: "2026-09-10" },
    { from: "2026-09-12", to: "2026-09-10" },
    { from: "2026-02-31", to: "2026-03-01" },
    { from: "2025-01-01", to: "2026-09-01" },
  ]) {
    assert.throws(() => resolveEmailWindow(input, NOW));
  }
});
