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

test("getSitemapData returns slug + lastSeenAt + contentUpdatedAt and sets a 5 minute Cache-Control header", async () => {
  const jobsService = {
    listSitemapData: async () => [
      {
        slug: "vaga-a-empresa-a-id1",
        lastSeenAt: new Date("2026-08-01T00:00:00.000Z"),
        contentUpdatedAt: new Date("2026-07-30T00:00:00.000Z"),
      },
      {
        slug: "vaga-b-empresa-b-id2",
        lastSeenAt: new Date("2026-08-02T00:00:00.000Z"),
        contentUpdatedAt: null,
      },
    ],
  };
  const controller = new InternalJobsController(jobsService as never);
  const response = buildResponse();

  const result = await controller.getSitemapData(response as never);

  assert.deepEqual(result, [
    {
      slug: "vaga-a-empresa-a-id1",
      lastSeenAt: "2026-08-01T00:00:00.000Z",
      contentUpdatedAt: "2026-07-30T00:00:00.000Z",
    },
    {
      slug: "vaga-b-empresa-b-id2",
      lastSeenAt: "2026-08-02T00:00:00.000Z",
      contentUpdatedAt: null,
    },
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

function buildRawJob(overrides: Record<string, unknown> = {}) {
  return {
    canonicalKey: "key-1",
    city: "São Paulo",
    company: { name: "Nubank", websiteUrl: null },
    country: "Brasil",
    descriptionClean: "desc",
    descriptionRaw: "<p>desc</p>",
    employmentType: null,
    enrichment: { technologies: ["python"], dominantArea: "DATA_AI" },
    externalJobId: "ext-1",
    firstSeenAt: new Date("2026-08-01T00:00:00.000Z"),
    id: "job-1",
    lastSeenAt: new Date("2026-08-02T00:00:00.000Z"),
    locationText: "São Paulo, Brasil",
    publishedAtSource: null,
    seniorityLevel: null,
    slug: "vaga-nubank-job-1",
    sourceJobUrl: "https://example.com/jobs/1",
    state: "SP",
    status: "active",
    title: "Engenheiro de Dados",
    workModel: "remote",
    ...overrides,
  };
}

test("getByCompanySlug returns companyName + jobs mapped through toPublicJobView", async () => {
  const jobsService = {
    getPublicByCompanySlug: async (companySlug: string) => {
      assert.equal(companySlug, "nubank");
      return { companyName: "Nubank", jobs: [buildRawJob()] };
    },
  };
  const controller = new InternalJobsController(jobsService as never);

  const result = await controller.getByCompanySlug("nubank");

  assert.equal(result.companyName, "Nubank");
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0]?.slug, "vaga-nubank-job-1");
});

test("getByCompanySlug returns companyName: null and jobs: [] when no company matches", async () => {
  const jobsService = {
    getPublicByCompanySlug: async () => null,
  };
  const controller = new InternalJobsController(jobsService as never);

  const result = await controller.getByCompanySlug("empresa-inexistente");

  assert.deepEqual(result, { companyName: null, jobs: [] });
});

test("getByTech defaults minCount to 10 and lowercases the tech param", async () => {
  let receivedArgs: [string, number] | undefined;
  const jobsService = {
    listPublicJobsByTech: async (tech: string, minCount: number) => {
      receivedArgs = [tech, minCount];
      return { total: 12, jobs: [buildRawJob()] };
    },
  };
  const controller = new InternalJobsController(jobsService as never);

  const result = await controller.getByTech("Python");

  assert.deepEqual(receivedArgs, ["python", 10]);
  assert.equal(result.total, 12);
  assert.equal(result.jobs.length, 1);
});

test("getByTech passes through an explicit minCount query param", async () => {
  let receivedMinCount: number | undefined;
  const jobsService = {
    listPublicJobsByTech: async (_tech: string, minCount: number) => {
      receivedMinCount = minCount;
      return { total: 3, jobs: [] };
    },
  };
  const controller = new InternalJobsController(jobsService as never);

  const result = await controller.getByTech("react", "5");

  assert.equal(receivedMinCount, 5);
  assert.equal(result.total, 3);
  assert.deepEqual(result.jobs, []);
});
