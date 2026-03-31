import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCompanyStatus,
  buildOverviewMetrics,
  buildPendingItems,
  buildSourceDetailHref,
  buildSourceStatus,
  filterCompanies,
  filterJobs,
  filterPendingItems,
  filterRuns,
  filterSources,
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

test("filterCompanies narrows by search and operational status", () => {
  const filtered = filterCompanies(
    [
      {
        id: "cmp_1",
        name: "ACME Labs",
        relatedSources: [],
        status: { label: "incompleta", tone: "warning" },
      },
      {
        id: "cmp_2",
        name: "Beta Corp",
        relatedSources: [{ id: "src_1" }],
        status: { label: "completa", tone: "success" },
      },
    ],
    { query: "acme", status: "incompleta" },
  );

  assert.deepEqual(
    filtered.map((item) => item.id),
    ["cmp_1"],
  );
});

test("filterSources narrows by source type and status", () => {
  const filtered = filterSources(
    [
      {
        company: { name: "ACME Labs" },
        id: "src_1",
        sourceName: "Career Site",
        sourceType: "custom_html",
        status: { label: "aguardando primeiro run", tone: "warning" },
      },
      {
        company: { name: "Beta Corp" },
        id: "src_2",
        sourceName: "API Feed",
        sourceType: "custom_api",
        status: { label: "ativa", tone: "success" },
      },
    ],
    { query: "api", status: "ativa", type: "custom_api" },
  );

  assert.deepEqual(
    filtered.map((item) => item.id),
    ["src_2"],
  );
});

test("filterRuns narrows by run status and free text", () => {
  const filtered = filterRuns(
    [
      {
        companyName: "ACME Labs",
        id: "run_1",
        sourceName: "Career Site",
        status: "failed",
      },
      {
        companyName: "Beta Corp",
        id: "run_2",
        sourceName: "API Feed",
        status: "completed",
      },
    ],
    { query: "beta", status: "completed" },
  );

  assert.deepEqual(
    filtered.map((item) => item.id),
    ["run_2"],
  );
});

test("filterJobs narrows by source, status, and free text", () => {
  const filtered = filterJobs(
    [
      {
        companyName: "ACME Labs",
        id: "job_1",
        locationText: "Sao Paulo",
        sourceName: "Career Site",
        status: "active",
        title: "Platform Engineer",
      },
      {
        companyName: "Beta Corp",
        id: "job_2",
        locationText: "Remoto",
        sourceName: "API Feed",
        status: "inactive",
        title: "Data Analyst",
      },
    ],
    { query: "analyst", sourceName: "API Feed", status: "inactive" },
  );

  assert.deepEqual(
    filtered.map((item) => item.id),
    ["job_2"],
  );
});

test("filterPendingItems narrows by type and query", () => {
  const filtered = filterPendingItems(
    [
      {
        description: "Empresa criada sem nenhuma fonte de vagas conectada.",
        entityId: "cmp_1",
        priority: "alta",
        title: "ACME Labs",
        type: "company-missing-source",
      },
      {
        description:
          "A fonte foi cadastrada, mas ainda nao executou a primeira ingestao.",
        entityId: "src_1",
        priority: "alta",
        title: "Career Site",
        type: "source-missing-first-run",
      },
    ],
    { query: "career", type: "source-missing-first-run" },
  );

  assert.deepEqual(
    filtered.map((item) => item.entityId),
    ["src_1"],
  );
});
