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

// Decisão de produto: vaga ainda não enriquecida (enrichmentStatus !=
// COMPLETED) não é conteúdo publicável — sem enrichment não há
// dominantArea/technologies pra calcular compatibilidade com ninguém.
// PUBLIC_JOB_INTEGRITY_WHERE é o único ponto de filtro compartilhado por
// listPublic/getPublicById/getPublicBySlug/listPublicFiltered/
// listByIdsWithEnrichment/listSitemapData/listPublicFacets — testar aqui
// cobre a regra em todos esses pontos de uma vez.
function buildWhereCapturingDatabaseStub() {
  const calls: Array<{ method: string; where: unknown }> = [];
  const database = {
    job: {
      findMany: async (args: { where: unknown }) => {
        calls.push({ method: "findMany", where: args.where });
        return [];
      },
      findFirst: async (args: { where: unknown }) => {
        calls.push({ method: "findFirst", where: args.where });
        return null;
      },
      count: async () => 0,
    },
  };
  return { database, calls };
}

test("getPublicBySlug requires enrichment.enrichmentStatus === COMPLETED", async () => {
  const { database, calls } = buildWhereCapturingDatabaseStub();
  const service = new JobsService(database as never, undefined as never, undefined as never);

  await service.getPublicBySlug("vaga-a-empresa-a-id1");

  const where = calls[0]?.where as { enrichment?: { enrichmentStatus?: string } };
  assert.equal(where.enrichment?.enrichmentStatus, "COMPLETED");
});

test("getPublicById requires enrichment.enrichmentStatus === COMPLETED", async () => {
  const { database, calls } = buildWhereCapturingDatabaseStub();
  const service = new JobsService(database as never, undefined as never, undefined as never);

  await service.getPublicById("job-1");

  const where = calls[0]?.where as { enrichment?: { enrichmentStatus?: string } };
  assert.equal(where.enrichment?.enrichmentStatus, "COMPLETED");
});

test("listPublicFiltered requires enrichment.enrichmentStatus === COMPLETED", async () => {
  const { database, calls } = buildWhereCapturingDatabaseStub();
  const service = new JobsService(database as never, undefined as never, undefined as never);

  await service.listPublicFiltered({ page: 1, limit: 20 });

  const where = calls[0]?.where as { enrichment?: { enrichmentStatus?: string } };
  assert.equal(where.enrichment?.enrichmentStatus, "COMPLETED");
});

test("listPublicFacets requires enrichment.enrichmentStatus === COMPLETED", async () => {
  const { database, calls } = buildWhereCapturingDatabaseStub();
  const service = new JobsService(database as never, undefined as never, undefined as never);

  await service.listPublicFacets();

  const where = calls[0]?.where as { enrichment?: { enrichmentStatus?: string } };
  assert.equal(where.enrichment?.enrichmentStatus, "COMPLETED");
});
