import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import sitemap from "./sitemap";

const originalFetch = globalThis.fetch;
const previousGhost = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

function stubSitemapJobsResponse(
  jobs: Array<{ slug: string; lastSeenAt: string }>,
) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(jobs), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "false";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = previousGhost;
});

test("sitemap includes /radar when ghost mode is off", async () => {
  stubSitemapJobsResponse([]);

  const entries = await sitemap();

  assert.equal(
    entries.some((entry) => entry.url.endsWith("/radar")),
    true,
  );
});

test("sitemap includes /radar/[slug] for each active job with a slug", async () => {
  stubSitemapJobsResponse([
    { slug: "vaga-a-empresa-a-id1", lastSeenAt: "2026-08-01T00:00:00.000Z" },
    { slug: "vaga-b-empresa-b-id2", lastSeenAt: "2026-08-02T00:00:00.000Z" },
  ]);

  const entries = await sitemap();
  const jobUrls = entries
    .map((entry) => entry.url)
    .filter((url) => url.includes("/radar/"));

  assert.equal(
    jobUrls.some((url) => url.endsWith("/radar/vaga-a-empresa-a-id1")),
    true,
  );
  assert.equal(
    jobUrls.some((url) => url.endsWith("/radar/vaga-b-empresa-b-id2")),
    true,
  );
});

test("sitemap does not add jobs beyond what the sitemap-data endpoint returns (inactive/slug-less jobs are filtered API-side)", async () => {
  // A API (JobsService.listSitemapData, coberta em
  // apps/api/src/jobs/jobs.service.spec.ts) já filtra por status=active e
  // slug != null antes de responder — o sitemap.ts só espelha o resultado.
  stubSitemapJobsResponse([
    { slug: "unica-vaga-elegivel-id1", lastSeenAt: "2026-08-01T00:00:00.000Z" },
  ]);

  const entries = await sitemap();
  const jobUrls = entries
    .map((entry) => entry.url)
    .filter((url) => url.includes("/radar/") && !url.endsWith("/radar"));

  assert.equal(jobUrls.length, 1);
});

test("sitemap never includes /radar or /radar/[slug] when ghost mode is on", async () => {
  process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response("[]", { status: 200 });
  }) as typeof fetch;

  const entries = await sitemap();

  assert.equal(
    entries.some((entry) => entry.url.includes("/radar")),
    false,
  );
  assert.equal(fetchCalled, false);
});

test("sitemap tolerates the sitemap-data endpoint being unreachable (never breaks the whole sitemap)", async () => {
  globalThis.fetch = (async () => {
    throw new Error("connect ECONNREFUSED");
  }) as typeof fetch;

  const entries = await sitemap();

  assert.equal(
    entries.some((entry) => entry.url.endsWith("/blog")),
    true,
  );
  assert.equal(
    entries.some((entry) => entry.url.includes("/radar/")),
    false,
  );
});
