import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCompanyStatus,
  buildOverviewMetrics,
  buildPendingItems,
  buildSourceDetailHref,
  buildSourceStatus,
} from "./admin-operations";

const company = {
  id: "cmp_1",
  name: "ACME Labs",
};

test("buildCompanyStatus returns incomplete when company has no sources", () => {
  assert.deepEqual(buildCompanyStatus(company, []), {
    label: "incompleta",
    tone: "warning",
  });
});

test("buildSourceStatus returns pending first run for a source without runs", () => {
  assert.deepEqual(
    buildSourceStatus({
      id: "src_1",
      ingestionRuns: [],
      lastErrorMessage: null,
      sourceName: "Career Site",
    }),
    {
      label: "aguardando primeiro run",
      tone: "warning",
    },
  );
});

test("buildPendingItems derives continuity actions for companies and sources", () => {
  const pendingItems = buildPendingItems({
    companies: [company],
    jobSources: [
      {
        company,
        companyId: company.id,
        id: "src_1",
        ingestionRuns: [],
        lastErrorMessage: null,
        sourceName: "Career Site",
      },
      {
        company,
        companyId: company.id,
        id: "src_2",
        ingestionRuns: [
          {
            failedCount: 1,
            id: "run_1",
            startedAt: "2026-03-31T20:00:00.000Z",
            status: "failed",
          },
        ],
        lastErrorMessage: "falha recente",
        sourceName: "API Source",
      },
    ],
    token: "abc",
  });

  assert.equal(pendingItems.length, 2);
  assert.deepEqual(
    pendingItems.map((item) => item.type),
    ["source-missing-first-run", "source-failed-recent-run"],
  );
  assert.equal(pendingItems[0]?.href, "/admin/fontes/src_1?token=abc");
});

test("buildOverviewMetrics aggregates counts from companies, sources, jobs and pending items", () => {
  const metrics = buildOverviewMetrics({
    companies: [company],
    jobsCount: 4,
    pendingCount: 2,
    sourceCount: 3,
    successfulRunsCount: 1,
  });

  assert.deepEqual(metrics, [
    { label: "empresas", value: 1 },
    { label: "fontes", value: 3 },
    { label: "vagas", value: 4 },
    { label: "pendencias", value: 2 },
    { label: "runs ok", value: 1 },
  ]);
});

test("buildSourceDetailHref points to the primary admin source route", () => {
  assert.equal(
    buildSourceDetailHref("src_1", "abc"),
    "/admin/fontes/src_1?token=abc",
  );
});
