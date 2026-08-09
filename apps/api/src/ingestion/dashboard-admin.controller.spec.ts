import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { GUARDS_METADATA } from "@nestjs/common/constants";
import { INTERNAL_ROLES_KEY } from "../common/roles.decorator";
import { DashboardAdminController } from "./dashboard-admin.controller";

function fakeResponse() {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };
}

test("dashboard admin controller enforces admin/superadmin guards", () => {
  const guards =
    Reflect.getMetadata(GUARDS_METADATA, DashboardAdminController) ?? [];
  const roles =
    Reflect.getMetadata(INTERNAL_ROLES_KEY, DashboardAdminController) ?? [];

  assert.equal(Array.isArray(guards), true);
  assert.equal(guards.length >= 2, true);
  assert.deepEqual(roles, ["admin", "superadmin"]);
});

test("GET ingestion-by-adapter returns array with adapters and sets no-store", async () => {
  const controller = new DashboardAdminController({
    getIngestionByAdapter: async () => ({
      adapters: [
        {
          adapterType: "gupy",
          totalSources: 164,
          activeSources: 164,
          pausedSources: 0,
          sourcesWith403: 0,
          lastRunAt: "2026-08-08T18:12:30.437Z",
          runsLast24h: 27,
          failedRunsLast24h: 0,
          newJobsLast24h: 47,
          nextJobRunAt: "2026-08-09T10:00:00.000Z",
        },
      ],
    }),
  } as never);

  const response = fakeResponse();
  const result = await controller.getIngestionByAdapter(response as never);

  assert.equal(Array.isArray(result.adapters), true);
  assert.equal(result.adapters[0]?.adapterType, "gupy");
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("GET enrichment-summary returns last24h and byArea", async () => {
  const controller = new DashboardAdminController({
    getEnrichmentSummary: async () => ({
      last24h: {
        enriched: 127,
        skipped: 890,
        failed: 3,
        pending: 0,
        approvalRate: 12.5,
      },
      byArea: [{ area: "DATA_AI", count: 34 }],
      crawlerDiscarded24h: 12,
      portalByArea: [],
      pendingEnrichment: 31,
    }),
  } as never);

  const response = fakeResponse();
  const result = await controller.getEnrichmentSummary(response as never);

  assert.equal(result.last24h.enriched, 127);
  assert.equal(Array.isArray(result.byArea), true);
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("GET alerts returns the 4 counters", async () => {
  const controller = new DashboardAdminController({
    getAlerts: async () => ({
      pausedSources: 2,
      sourcesWith403: 1,
      driftSources: 0,
      failedJobsToday: 3,
    }),
  } as never);

  const response = fakeResponse();
  const result = await controller.getAlerts(response as never);

  assert.equal(result.pausedSources, 2);
  assert.equal(result.sourcesWith403, 1);
  assert.equal(result.driftSources, 0);
  assert.equal(result.failedJobsToday, 3);
  assert.equal(response.headers["Cache-Control"], "no-store");
});
