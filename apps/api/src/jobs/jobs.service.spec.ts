import assert from "node:assert/strict";
import { test } from "node:test";

import { JobsService } from "./jobs.service";

function buildDatabaseStub(
  jobs: Array<{ slug: string | null; lastSeenAt: Date }>,
) {
  return {
    job: {
      findMany: async () => jobs,
    },
  };
}

test("listSitemapData filters out jobs without a persisted slug", async () => {
  const database = buildDatabaseStub([
    { slug: "vaga-a-empresa-a-id1", lastSeenAt: new Date("2026-08-01T00:00:00.000Z") },
    { slug: null, lastSeenAt: new Date("2026-08-02T00:00:00.000Z") },
  ]);
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  const result = await service.listSitemapData();

  assert.deepEqual(
    result.map((job) => job.slug),
    ["vaga-a-empresa-a-id1"],
  );
});
