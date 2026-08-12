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
    {
      slug: "vaga-a-empresa-a-id1",
      lastSeenAt: new Date("2026-08-01T00:00:00.000Z"),
    },
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
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  await service.getPublicBySlug("vaga-a-empresa-a-id1");

  const where = calls[0]?.where as {
    enrichment?: { enrichmentStatus?: string };
  };
  assert.equal(where.enrichment?.enrichmentStatus, "COMPLETED");
});

test("getPublicById requires enrichment.enrichmentStatus === COMPLETED", async () => {
  const { database, calls } = buildWhereCapturingDatabaseStub();
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  await service.getPublicById("job-1");

  const where = calls[0]?.where as {
    enrichment?: { enrichmentStatus?: string };
  };
  assert.equal(where.enrichment?.enrichmentStatus, "COMPLETED");
});

test("listPublicFiltered requires enrichment.enrichmentStatus === COMPLETED", async () => {
  const { database, calls } = buildWhereCapturingDatabaseStub();
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  await service.listPublicFiltered({ page: 1, limit: 20 });

  const where = calls[0]?.where as {
    enrichment?: { enrichmentStatus?: string };
  };
  assert.equal(where.enrichment?.enrichmentStatus, "COMPLETED");
});

// dominantArea=OTHER (label "Geral" no filtro) é o catch-all do LLM pra
// vaga fora da taxonomia tech — boards globais trazem RH/jurídico/
// engenharia não-tech junto com a vaga tech de verdade. Decisão de
// produto: nunca aparece no portal, nem por default nem via ?area=OTHER
// explícito.
test("listPublicFiltered excludes dominantArea=OTHER by default", async () => {
  const { database, calls } = buildWhereCapturingDatabaseStub();
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  await service.listPublicFiltered({ page: 1, limit: 20 });

  const where = calls[0]?.where as {
    enrichment?: { dominantArea?: { not?: string } };
  };
  assert.deepEqual(where.enrichment?.dominantArea, { not: "OTHER" });
});

test("listPublicFiltered keeps dominantArea=OTHER excluded even when ?area=OTHER is passed explicitly", async () => {
  const { database, calls } = buildWhereCapturingDatabaseStub();
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  await service.listPublicFiltered({ page: 1, limit: 20, area: "OTHER" });

  const where = calls[0]?.where as {
    enrichment?: { dominantArea?: { not?: string; in?: string[] } };
  };
  assert.deepEqual(where.enrichment?.dominantArea, { not: "OTHER" });
});

test("listPublicFiltered strips OTHER out of a mixed ?area filter, keeping the rest", async () => {
  const { database, calls } = buildWhereCapturingDatabaseStub();
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  await service.listPublicFiltered({
    page: 1,
    limit: 20,
    area: "OTHER,DATA_AI",
  });

  const where = calls[0]?.where as {
    enrichment?: { dominantArea?: { in?: string[] } };
  };
  assert.deepEqual(where.enrichment?.dominantArea, { in: ["DATA_AI"] });
});

test("listPublicFiltered filters by technology via requiredSkills OR technologies", async () => {
  const { database, calls } = buildWhereCapturingDatabaseStub();
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  await service.listPublicFiltered({
    page: 1,
    limit: 20,
    technology: "python",
  });

  const where = calls[0]?.where as {
    enrichment?: { OR?: Array<Record<string, unknown>> };
  };
  assert.deepEqual(where.enrichment?.OR, [
    { requiredSkills: { has: "python" } },
    { technologies: { has: "python" } },
  ]);
});

test("listPublicFacets requires enrichment.enrichmentStatus === COMPLETED", async () => {
  const { database, calls } = buildWhereCapturingDatabaseStub();
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  await service.listPublicFacets();

  const where = calls[0]?.where as {
    enrichment?: { enrichmentStatus?: string };
  };
  assert.equal(where.enrichment?.enrichmentStatus, "COMPLETED");
});

function buildFacetsDatabaseStub(
  jobs: Array<{
    workModel: string | null;
    state: string | null;
    city: string | null;
    company: { name: string };
    enrichment: {
      dominantArea: string | null;
      seniority: string | null;
    } | null;
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
    {
      workModel: null,
      state: "SP",
      city: "São Paulo",
      company: { name: "A" },
      enrichment: null,
    },
    {
      workModel: null,
      state: "RJ",
      city: "Rio de Janeiro",
      company: { name: "B" },
      enrichment: null,
    },
  ]);
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  const facets = await service.listPublicFacets();

  assert.deepEqual(facets.cities.map((c) => c.value).sort(), [
    "Rio de Janeiro",
    "São Paulo",
  ]);
});

test("listPublicFacets scopes cities to the selected state (cascade) — accepts sigla, nome por extenso e caixa misturada como o mesmo estado", async () => {
  const database = buildFacetsDatabaseStub([
    {
      workModel: null,
      state: "SP",
      city: "São Paulo",
      company: { name: "A" },
      enrichment: null,
    },
    {
      workModel: null,
      state: "São Paulo",
      city: "Campinas",
      company: { name: "B" },
      enrichment: null,
    },
    {
      workModel: null,
      state: "SAO PAULO",
      city: "Jaguariúna",
      company: { name: "C" },
      enrichment: null,
    },
    {
      workModel: null,
      state: "RJ",
      city: "Rio de Janeiro",
      company: { name: "D" },
      enrichment: null,
    },
  ]);
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  const facets = await service.listPublicFacets({ state: "SP" });

  assert.deepEqual(facets.cities.map((c) => c.value).sort(), [
    "Campinas",
    "Jaguariúna",
    "São Paulo",
  ]);
});

test("listPublicFacets excludes jobs with an unrecognized/foreign state from the scoped city facet", async () => {
  const database = buildFacetsDatabaseStub([
    {
      workModel: null,
      state: "SP",
      city: "São Paulo",
      company: { name: "A" },
      enrichment: null,
    },
    {
      workModel: null,
      state: "CA",
      city: "San Francisco",
      company: { name: "B" },
      enrichment: null,
    },
  ]);
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  const facets = await service.listPublicFacets({ state: "SP" });

  assert.deepEqual(
    facets.cities.map((c) => c.value),
    ["São Paulo"],
  );
});

test("getPublicByCompanySlug matches by slugified company name and returns only that company's jobs", async () => {
  const database = {
    job: {
      findMany: async (args: { distinct?: string[] }) => {
        if (args.distinct) {
          return [
            { companyId: "company-1", company: { name: "Nubank" } },
            { companyId: "company-2", company: { name: "iFood" } },
          ];
        }
        return [{ id: "job-1", companyId: "company-1" }];
      },
    },
  };
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  const result = await service.getPublicByCompanySlug("nubank");

  assert.ok(result);
  assert.equal(result?.companyName, "Nubank");
  assert.equal(result?.jobs.length, 1);
});

test("getPublicByCompanySlug returns null when no active-job company matches the slug", async () => {
  const database = {
    job: {
      findMany: async () => [
        { companyId: "company-1", company: { name: "Nubank" } },
      ],
    },
  };
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  const result = await service.getPublicByCompanySlug("empresa-inexistente");

  assert.equal(result, null);
});

test("listPublicJobsByTech returns the real total but no jobs when below minCount", async () => {
  const database = {
    job: {
      count: async () => 3,
      findMany: async () => {
        throw new Error("findMany must not run below the volume threshold");
      },
    },
  };
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  const result = await service.listPublicJobsByTech("python", 10);

  assert.equal(result.total, 3);
  assert.equal(result.jobs.length, 0);
});

test("listPublicJobsByTech filters by requiredSkills OR technologies once at/above minCount", async () => {
  const calls: Array<{ where: unknown }> = [];
  const database = {
    job: {
      count: async () => 12,
      findMany: async (args: { where: unknown }) => {
        calls.push({ where: args.where });
        return [{ id: "job-1" }];
      },
    },
  };
  const service = new JobsService(
    database as never,
    undefined as never,
    undefined as never,
  );

  const result = await service.listPublicJobsByTech("python", 10);

  assert.equal(result.total, 12);
  assert.equal(result.jobs.length, 1);
  const where = calls[0]?.where as {
    enrichment?: { OR?: Array<Record<string, unknown>> };
  };
  assert.deepEqual(where.enrichment?.OR, [
    { requiredSkills: { has: "python" } },
    { technologies: { has: "python" } },
  ]);
});
