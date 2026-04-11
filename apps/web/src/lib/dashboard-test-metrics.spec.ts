import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDashboardTestHistoryView,
  buildDashboardTestMetrics,
  extractDashboardAnalysisSignal,
  getDashboardScoreColor,
} from "./dashboard-test-metrics";

const INPUT = [
  { id: "a1", score: 80, improvement: 14 },
  { id: "a2", score: 76, improvement: 10 },
];

test("buildDashboardTestMetrics returns computed values", () => {
  const result = buildDashboardTestMetrics(INPUT);

  assert.equal(result.averageScore, 78);
  assert.equal(result.highCompatibilityCount, 1);
  assert.equal(result.evolutionPercentage, 12);
});

test("buildDashboardTestHistoryView adds score and improvement", () => {
  const item = buildDashboardTestHistoryView(INPUT[0]);

  assert.equal(typeof item.score, "number");
  assert.equal(typeof item.improvement, "number");
});

test("extractDashboardAnalysisSignal returns real values from analysis payload", () => {
  const signal = extractDashboardAnalysisSignal({
    fit: { score: 82 },
    projecao_melhoria: { score_atual: 69, score_pos_otimizacao: 82 },
  });

  assert.equal(signal.score, 82);
  assert.equal(signal.improvement, 13);
});

test("getDashboardScoreColor follows score thresholds", () => {
  assert.equal(getDashboardScoreColor(49), "#dc2626");
  assert.equal(getDashboardScoreColor(60), "#ca8a04");
  assert.equal(getDashboardScoreColor(100), "rgb(22, 163, 74)");
});
