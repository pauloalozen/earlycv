import assert from "node:assert/strict";
import { test } from "node:test";

import { InternalJobsController } from "./internal-jobs.controller";

function buildResponse() {
  const headers: Record<string, string> = {};
  return {
    setHeader: (key: string, value: string) => {
      headers[key] = value;
    },
    headers,
  };
}

test("getSitemapData returns slug + lastSeenAt and sets a 5 minute Cache-Control header", async () => {
  const jobsService = {
    listSitemapData: async () => [
      { slug: "vaga-a-empresa-a-id1", lastSeenAt: new Date("2026-08-01T00:00:00.000Z") },
      { slug: "vaga-b-empresa-b-id2", lastSeenAt: new Date("2026-08-02T00:00:00.000Z") },
    ],
  };
  const controller = new InternalJobsController(jobsService as never);
  const response = buildResponse();

  const result = await controller.getSitemapData(response as never);

  assert.deepEqual(result, [
    { slug: "vaga-a-empresa-a-id1", lastSeenAt: "2026-08-01T00:00:00.000Z" },
    { slug: "vaga-b-empresa-b-id2", lastSeenAt: "2026-08-02T00:00:00.000Z" },
  ]);
  assert.equal(response.headers["Cache-Control"], "public, max-age=300");
});

test("getSitemapData returns an empty array when there are no eligible jobs", async () => {
  const jobsService = { listSitemapData: async () => [] };
  const controller = new InternalJobsController(jobsService as never);
  const response = buildResponse();

  const result = await controller.getSitemapData(response as never);

  assert.deepEqual(result, []);
});
