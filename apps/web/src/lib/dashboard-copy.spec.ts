import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DASHBOARD_METRIC_LABELS,
  formatDashboardOverview,
} from "./dashboard-copy.ts";

test("DASHBOARD_METRIC_LABELS keeps approved metric labels", () => {
  assert.deepEqual(DASHBOARD_METRIC_LABELS, {
    averageScore: "Seu score médio",
    matchCount: "Vagas analisadas",
    recentImprovement: "Melhoria recente",
  });
});

test("formatDashboardOverview returns result-oriented summary strings", () => {
  const result = formatDashboardOverview({
    analyzed: 3,
    generated: 2,
    availableCredits: 7,
  });

  assert.deepEqual(result, {
    analyzed: "3 CVs analisados",
    generated: "2 versões geradas",
    availableCredits: "7 créditos disponíveis",
  });
});

test("formatDashboardOverview handles unlimited credits copy", () => {
  const result = formatDashboardOverview({
    analyzed: 3,
    generated: 2,
    availableCredits: "Ilimitado",
  });

  assert.equal(result.availableCredits, "Créditos disponíveis: Ilimitado");
});
