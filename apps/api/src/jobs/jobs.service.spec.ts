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

function buildFacetsDatabaseStub(
  jobs: Array<{
    workModel: string | null;
    state: string | null;
    city: string | null;
    company: { name: string };
    enrichment: { dominantArea: string | null; seniority: string | null } | null;
  }>,
) {
  return {
    job: {
      findMany: async () => jobs,
    },
  };
}

test("listPublicFacets returns cities from every state when no state filter is applied", async () => {
  const database = buildFacetsDatabaseStub([
    { workModel: null, state: "SP", city: "São Paulo", company: { name: "A" }, enrichment: null },
    { workModel: null, state: "RJ", city: "Rio de Janeiro", company: { name: "B" }, enrichment: null },
  ]);
  const service = new JobsService(database as never, undefined as never, undefined as never);

  const facets = await service.listPublicFacets();

  assert.deepEqual(
    facets.cities.map((c) => c.value).sort(),
    ["Rio de Janeiro", "São Paulo"],
  );
});

test("listPublicFacets scopes cities to the selected state (cascade) — accepts sigla, nome por extenso e caixa misturada como o mesmo estado", async () => {
  const database = buildFacetsDatabaseStub([
    { workModel: null, state: "SP", city: "São Paulo", company: { name: "A" }, enrichment: null },
    { workModel: null, state: "São Paulo", city: "Campinas", company: { name: "B" }, enrichment: null },
    { workModel: null, state: "SAO PAULO", city: "Jaguariúna", company: { name: "C" }, enrichment: null },
    { workModel: null, state: "RJ", city: "Rio de Janeiro", company: { name: "D" }, enrichment: null },
  ]);
  const service = new JobsService(database as never, undefined as never, undefined as never);

  const facets = await service.listPublicFacets({ state: "SP" });

  assert.deepEqual(
    facets.cities.map((c) => c.value).sort(),
    ["Campinas", "Jaguariúna", "São Paulo"],
  );
});

test("listPublicFacets excludes jobs with an unrecognized/foreign state from the scoped city facet", async () => {
  const database = buildFacetsDatabaseStub([
    { workModel: null, state: "SP", city: "São Paulo", company: { name: "A" }, enrichment: null },
    { workModel: null, state: "CA", city: "San Francisco", company: { name: "B" }, enrichment: null },
  ]);
  const service = new JobsService(database as never, undefined as never, undefined as never);

  const facets = await service.listPublicFacets({ state: "SP" });

  assert.deepEqual(
    facets.cities.map((c) => c.value),
    ["São Paulo"],
  );
});
