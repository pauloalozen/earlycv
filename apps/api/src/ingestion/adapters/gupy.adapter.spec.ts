import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../../database/database.service";
import { IngestionFetchError } from "../errors";
import type {
  SemanticFilterDecision,
  SemanticFilterService,
} from "../semantic-filter.service";
import type { JobSourceContext } from "../types";
import { GupyAdapter } from "./gupy.adapter";

type MockResponse = {
  status?: number;
  json?: unknown;
  text?: string;
};

function createSemanticFilterMock(
  decision: SemanticFilterDecision = {
    configVersion: "v1",
    reason: "tech_signal:mock",
    result: "ENRICH",
  },
) {
  const evaluatedTitles: string[] = [];
  const semanticFilter = {
    evaluate: async (normalizedTitle: string) => {
      evaluatedTitles.push(normalizedTitle);
      return decision;
    },
  } as unknown as SemanticFilterService;

  return { evaluatedTitles, semanticFilter };
}

function createDatabaseMock(options?: { upsertShouldThrow?: boolean }) {
  const upsertCalls: unknown[] = [];
  const database = {
    crawlerDiscardedTitle: {
      upsert: async (args: unknown) => {
        upsertCalls.push(args);
        if (options?.upsertShouldThrow) {
          throw new Error("db unavailable");
        }
        return {};
      },
    },
  } as unknown as DatabaseService;

  return { database, upsertCalls };
}

function boardHtmlOf(payload: unknown) {
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>`;
}

function createJobSourceContext(sourceUrl: string): JobSourceContext {
  return {
    checkIntervalMinutes: 30,
    company: {
      id: "company-id",
      name: "Company",
      normalizedName: "company",
    },
    companyId: "company-id",
    crawlStrategy: "api",
    id: "job-source-id",
    parserKey: "gupy",
    sourceName: "Gupy Source",
    sourceType: "gupy",
    sourceUrl,
  };
}

function createFetchMock(sequence: MockResponse[]) {
  const originalFetch = globalThis.fetch;
  const calls: URL[] = [];
  let index = 0;

  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const callUrl = new URL(
      typeof input === "string" ? input : input.toString(),
    );
    calls.push(callUrl);

    const entry = sequence[index] ?? sequence[sequence.length - 1];
    index += 1;
    const status = entry?.status ?? 200;

    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      json: async () => entry?.json ?? {},
      text: async () => entry?.text ?? "",
    } as Response;
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("GupyAdapter paginates and maps observation fields", async () => {
  const now = "2026-05-16T10:00:00.000Z";
  const fetchMock = createFetchMock([
    {
      json: {
        results: [
          {
            id: 101,
            name: "Pessoa Engenheira de Dados",
            description: "<p>Descricao principal</p>",
            responsibilities: "<ul><li>Responsabilidades</li></ul>",
            prerequisites: "<ul><li>Requisitos</li></ul>",
            publishedAt: now,
            workplaceType: "on-site",
            addressCity: "Sao Paulo",
            addressState: "SP",
            addressCountry: "Brasil",
            departmentName: "Tecnologia",
            roleName: "Dados",
            type: "CLT",
          },
        ],
        total: 2,
      },
    },
    {
      json: {
        results: [
          {
            id: 102,
            name: "Pessoa Desenvolvedora Backend",
            description: "Descricao 2",
            responsibilities: null,
            prerequisites: null,
            publishedAt: now,
            workplaceType: "remote",
            addressCity: "Campinas",
            addressState: "SP",
            addressCountry: "Brasil",
            departmentName: "Engenharia",
            roleName: "Backend",
            type: "CLT",
          },
        ],
        total: 2,
      },
    },
  ]);

  try {
    const adapter = new GupyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
    );

    assert.equal(observations.length, 2);
    assert.equal(observations[0]?.canonicalKey, "gupy:ifood:101");
    assert.equal(
      observations[0]?.sourceJobUrl,
      "https://ifood.gupy.io/jobs/101?jobBoardSource=gupy_public_page",
    );
    assert.equal(observations[0]?.workModel, "onsite");
    assert.equal(observations[0]?.locationText, "Sao Paulo, SP, Brasil");
    assert.equal(observations[0]?.externalJobId, "101");
    assert.equal(observations[0]?.publishedAtSource, now);
    assert.equal(
      observations[0]?.descriptionRaw.includes("Responsabilidades"),
      true,
    );
    assert.equal(
      observations[0]?.descriptionClean.includes("Requisitos"),
      true,
    );
    assert.equal(fetchMock.calls.length, 2);
    assert.equal(fetchMock.calls[0]?.searchParams.get("offset"), "0");
    assert.equal(fetchMock.calls[1]?.searchParams.get("offset"), "1");
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter maps department and normalizes employmentType from API path", async () => {
  const now = "2026-05-16T10:00:00.000Z";
  const cases: Array<[string, string]> = [
    ["vacancy_type_effective", "full_time"],
    ["vacancy_type_internship", "internship"],
    ["vacancy_type_apprentice", "apprentice"],
    ["vacancy_type_temporary", "temporary"],
    ["vacancy_type_talent_pool", "talent_pool"],
    ["vacancy_legal_entity", "pj"],
    ["vacancy_type_autonomous", "autonomous"],
    ["full_time", "full_time"],
  ];

  for (const [raw, expected] of cases) {
    const fetchMock = createFetchMock([
      {
        json: {
          results: [
            {
              id: 500,
              name: "Pessoa Engenheira",
              description: "Descricao",
              publishedAt: now,
              departmentName: "Tecnologia",
              type: raw,
            },
          ],
          total: 1,
        },
      },
    ]);

    try {
      const adapter = new GupyAdapter(
        createSemanticFilterMock().semanticFilter,
        createDatabaseMock().database,
      );
      const observations = await adapter.collect(
        createJobSourceContext("https://ifood.gupy.io"),
      );

      assert.equal(observations[0]?.department, "Tecnologia");
      assert.equal(observations[0]?.employmentType, expected);
      assert.equal(observations[0]?.employmentTypeRaw, raw);
    } finally {
      fetchMock.restore();
    }
  }
});

test("GupyAdapter passes through unmapped employmentType raw value", async () => {
  const now = "2026-05-16T10:00:00.000Z";
  const fetchMock = createFetchMock([
    {
      json: {
        results: [
          {
            id: 501,
            name: "Pessoa Engenheira",
            description: "Descricao",
            publishedAt: now,
            type: "vacancy_type_unknown_future_value",
          },
        ],
        total: 1,
      },
    },
  ]);

  try {
    const adapter = new GupyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
    );

    assert.equal(
      observations[0]?.employmentType,
      "vacancy_type_unknown_future_value",
    );
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter retries once on 429 and continues on non-404 errors", async () => {
  const now = "2026-05-16T10:00:00.000Z";
  const fetchMock = createFetchMock([
    {
      status: 429,
      json: { message: "too many requests" },
    },
    {
      json: {
        results: [
          {
            id: 900,
            name: "Pessoa Analista de Dados",
            description: "Descricao",
            responsibilities: null,
            prerequisites: null,
            publishedAt: now,
            workplaceType: "hybrid",
            addressCity: "Recife",
            addressState: "PE",
            addressCountry: "Brasil",
          },
        ],
        total: 2,
      },
    },
    {
      status: 500,
      json: { message: "temporary error" },
    },
  ]);

  try {
    const adapter = new GupyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://nubank.gupy.io"),
    );

    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.canonicalKey, "gupy:nubank:900");
    assert.equal(observations[0]?.workModel, "hybrid");
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter throws explicit error when subdomain is missing", async () => {
  const adapter = new GupyAdapter(
    createSemanticFilterMock().semanticFilter,
    createDatabaseMock().database,
  );

  await assert.rejects(
    () =>
      adapter.collect(
        createJobSourceContext("https://careers.example.com/jobs"),
      ),
    /gupy sourceUrl must point to \{subdomain\}\.gupy\.io/i,
  );
});

test("GupyAdapter throws typed error when board API responds 403", async () => {
  const fetchMock = createFetchMock([
    {
      status: 403,
      json: { message: "forbidden" },
    },
  ]);

  try {
    const adapter = new GupyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () => adapter.collect(createJobSourceContext("https://ifood.gupy.io")),
      (error) => {
        assert.equal(error instanceof IngestionFetchError, true);
        assert.equal((error as IngestionFetchError).statusCode, 403);
        return true;
      },
    );
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter skips detail fetch for fresh job from HTML board", async () => {
  const boardPayload = {
    props: {
      pageProps: {
        jobs: [
          {
            id: "101",
            title: "Pessoa Engenheira Backend",
            type: "CLT",
            workplace: {
              address: {
                city: "Sao Paulo",
                country: "Brasil",
                state: "SP",
              },
              workplaceType: "hybrid",
            },
          },
        ],
      },
    },
  };
  const boardHtml = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(boardPayload)}</script></html>`;
  const fetchMock = createFetchMock([
    { status: 500, json: { message: "fallback html" } },
    { status: 200, text: boardHtml },
  ]);

  try {
    const adapter = new GupyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
      {
        getExistingJobByCanonicalKey: async () => ({
          lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
        }),
      },
    );

    assert.equal(observations.length, 1);
    assert.equal(fetchMock.calls.length, 2);
    assert.equal(observations[0]?.detailFetchSkipped, true);
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter fetches detail for stale existing HTML job", async () => {
  const boardPayload = {
    props: { pageProps: { jobs: [{ id: "102", title: "Pessoa Backend" }] } },
  };
  const detailPayload = {
    props: {
      pageProps: {
        job: {
          id: "102",
          name: "Pessoa Backend",
          description: "<p>Desc</p>",
          publishedAt: "2026-05-16T10:00:00.000Z",
        },
      },
    },
  };
  const fetchMock = createFetchMock([
    { status: 500, json: { message: "fallback html" } },
    {
      status: 200,
      text: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(boardPayload)}</script>`,
    },
    {
      status: 200,
      text: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(detailPayload)}</script>`,
    },
  ]);

  try {
    const adapter = new GupyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
      {
        getExistingJobByCanonicalKey: async () => ({
          lastSeenAt: new Date("2024-01-01T10:00:00.000Z"),
        }),
      },
    );

    assert.equal(observations.length, 1);
    assert.equal(fetchMock.calls.length, 3);
    assert.equal(observations[0]?.detailFetchSkipped, undefined);
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter fetches detail for new HTML job", async () => {
  const boardPayload = {
    props: { pageProps: { jobs: [{ id: "103", title: "Pessoa Frontend" }] } },
  };
  const detailPayload = {
    props: {
      pageProps: {
        job: {
          id: "103",
          name: "Pessoa Frontend",
          description: "<p>Desc</p>",
          publishedAt: "2026-05-16T10:00:00.000Z",
        },
      },
    },
  };
  const fetchMock = createFetchMock([
    { status: 500, json: { message: "fallback html" } },
    {
      status: 200,
      text: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(boardPayload)}</script>`,
    },
    {
      status: 200,
      text: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(detailPayload)}</script>`,
    },
  ]);

  try {
    const adapter = new GupyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
      {
        getExistingJobByCanonicalKey: async () => null,
      },
    );

    assert.equal(observations.length, 1);
    assert.equal(fetchMock.calls.length, 3);
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter fail-opens when lookup throws in HTML path", async () => {
  const boardPayload = {
    props: { pageProps: { jobs: [{ id: "104", title: "Pessoa Dados" }] } },
  };
  const detailPayload = {
    props: {
      pageProps: {
        job: {
          id: "104",
          name: "Pessoa Dados",
          description: "<p>Desc</p>",
          publishedAt: "2026-05-16T10:00:00.000Z",
        },
      },
    },
  };
  const fetchMock = createFetchMock([
    { status: 500, json: { message: "fallback html" } },
    {
      status: 200,
      text: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(boardPayload)}</script>`,
    },
    {
      status: 200,
      text: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(detailPayload)}</script>`,
    },
  ]);

  try {
    const adapter = new GupyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
      {
        getExistingJobByCanonicalKey: async () => {
          throw new Error("lookup failed");
        },
      },
    );

    assert.equal(observations.length, 1);
    assert.equal(fetchMock.calls.length, 3);
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter does not call lookup context on API path", async () => {
  const now = "2026-05-16T10:00:00.000Z";
  const fetchMock = createFetchMock([
    {
      json: {
        results: [
          {
            id: 701,
            name: "Pessoa DevOps",
            description: "Desc",
            publishedAt: now,
          },
        ],
        total: 1,
      },
    },
  ]);
  let lookupCalls = 0;

  try {
    const adapter = new GupyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
      {
        getExistingJobByCanonicalKey: async () => {
          lookupCalls += 1;
          return null;
        },
      },
    );

    assert.equal(observations.length, 1);
    assert.equal(lookupCalls, 0);
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter discards new HTML job on noise_signal without detail-fetch", async () => {
  const boardPayload = {
    props: {
      pageProps: { jobs: [{ id: "201", title: "Enfermeiro Plantonista" }] },
    },
  };
  const fetchMock = createFetchMock([
    { status: 500, json: { message: "fallback html" } },
    {
      status: 200,
      text: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(boardPayload)}</script>`,
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock({
      configVersion: "v1",
      reason: "noise_signal:enfermeiro",
      result: "SKIP",
    });
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new GupyAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
      { getExistingJobByCanonicalKey: async () => null },
    );

    assert.equal(observations.length, 0);
    assert.equal(fetchMock.calls.length, 2);
    assert.deepEqual(evaluatedTitles, ["enfermeiro plantonista"]);
    assert.equal(upsertCalls.length, 1);
    assert.deepEqual(upsertCalls[0], {
      where: { canonicalKey: "gupy:ifood:201" },
      create: {
        canonicalKey: "gupy:ifood:201",
        externalJobId: "201",
        filterReason: "noise_signal:enfermeiro",
        filterVersion: "v1",
        jobSourceId: "job-source-id",
        normalizedTitle: "enfermeiro plantonista",
        title: "Enfermeiro Plantonista",
      },
      update: {
        discardedAt: upsertCalls[0]?.update?.discardedAt,
        filterReason: "noise_signal:enfermeiro",
        filterVersion: "v1",
      },
    });
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter discards new HTML job on zona_cinza without detail-fetch", async () => {
  const boardPayload = {
    props: {
      pageProps: { jobs: [{ id: "202", title: "Coordenador de Eventos" }] },
    },
  };
  const fetchMock = createFetchMock([
    { status: 500, json: { message: "fallback html" } },
    {
      status: 200,
      text: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(boardPayload)}</script>`,
    },
  ]);

  try {
    const { semanticFilter } = createSemanticFilterMock({
      configVersion: "v1",
      reason: "zona_cinza",
      result: "SKIP",
    });
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new GupyAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
      { getExistingJobByCanonicalKey: async () => null },
    );

    assert.equal(observations.length, 0);
    assert.equal(fetchMock.calls.length, 2);
    assert.equal(upsertCalls.length, 1);
    assert.equal(
      (upsertCalls[0] as { create: { filterReason: string } }).create
        .filterReason,
      "zona_cinza",
    );
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter fetches detail for new HTML job on tech_signal without discarding", async () => {
  const boardPayload = {
    props: {
      pageProps: { jobs: [{ id: "203", title: "Desenvolvedor Backend" }] },
    },
  };
  const detailPayload = {
    props: {
      pageProps: {
        job: {
          id: "203",
          name: "Desenvolvedor Backend",
          description: "<p>Desc</p>",
          publishedAt: "2026-05-16T10:00:00.000Z",
        },
      },
    },
  };
  const fetchMock = createFetchMock([
    { status: 500, json: { message: "fallback html" } },
    {
      status: 200,
      text: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(boardPayload)}</script>`,
    },
    {
      status: 200,
      text: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(detailPayload)}</script>`,
    },
  ]);

  try {
    const { semanticFilter } = createSemanticFilterMock({
      configVersion: "v1",
      reason: "tech_signal:desenvolvedor",
      result: "ENRICH",
    });
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new GupyAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
      { getExistingJobByCanonicalKey: async () => null },
    );

    assert.equal(observations.length, 1);
    assert.equal(fetchMock.calls.length, 3);
    assert.equal(upsertCalls.length, 0);
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter does not evaluate semantic filter for existing (dedup) HTML job", async () => {
  const boardPayload = {
    props: {
      pageProps: {
        jobs: [
          {
            id: "204",
            title: "Pessoa Engenheira Backend",
            workplace: {
              address: { city: "Sao Paulo", country: "Brasil", state: "SP" },
              workplaceType: "hybrid",
            },
          },
        ],
      },
    },
  };
  const fetchMock = createFetchMock([
    { status: 500, json: { message: "fallback html" } },
    { status: 200, text: boardHtmlOf(boardPayload) },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock();
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new GupyAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
      {
        getExistingJobByCanonicalKey: async () => ({
          lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
        }),
      },
    );

    assert.equal(observations.length, 1);
    assert.equal(fetchMock.calls.length, 2);
    assert.equal(observations[0]?.detailFetchSkipped, true);
    assert.equal(evaluatedTitles.length, 0);
    assert.equal(upsertCalls.length, 0);
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter continues ingestion when saving CrawlerDiscardedTitle fails", async () => {
  const boardPayload = {
    props: {
      pageProps: {
        jobs: [
          { id: "205", title: "Enfermeiro Plantonista" },
          { id: "206", title: "Desenvolvedor Backend" },
        ],
      },
    },
  };
  const detailPayload = {
    props: {
      pageProps: {
        job: {
          id: "206",
          name: "Desenvolvedor Backend",
          description: "<p>Desc</p>",
          publishedAt: "2026-05-16T10:00:00.000Z",
        },
      },
    },
  };
  const fetchMock = createFetchMock([
    { status: 500, json: { message: "fallback html" } },
    { status: 200, text: boardHtmlOf(boardPayload) },
    { status: 200, text: boardHtmlOf(detailPayload) },
  ]);

  try {
    let evalCalls = 0;
    const semanticFilter = {
      evaluate: async (normalizedTitle: string) => {
        evalCalls += 1;
        if (normalizedTitle === "enfermeiro plantonista") {
          return {
            configVersion: "v1",
            reason: "noise_signal:enfermeiro",
            result: "SKIP" as const,
          };
        }
        return {
          configVersion: "v1",
          reason: "tech_signal:desenvolvedor",
          result: "ENRICH" as const,
        };
      },
    } as unknown as SemanticFilterService;
    const { database, upsertCalls } = createDatabaseMock({
      upsertShouldThrow: true,
    });
    const adapter = new GupyAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
      { getExistingJobByCanonicalKey: async () => null },
    );

    assert.equal(evalCalls, 2);
    assert.equal(upsertCalls.length, 1);
    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.canonicalKey, "gupy:ifood:206");
  } finally {
    fetchMock.restore();
  }
});

test("GupyAdapter API path never calls SemanticFilterService", async () => {
  const now = "2026-05-16T10:00:00.000Z";
  const fetchMock = createFetchMock([
    {
      json: {
        results: [
          {
            id: 801,
            name: "Enfermeiro Plantonista",
            description: "Desc",
            publishedAt: now,
          },
        ],
        total: 1,
      },
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock();
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new GupyAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://ifood.gupy.io"),
      { getExistingJobByCanonicalKey: async () => null },
    );

    assert.equal(observations.length, 1);
    assert.equal(evaluatedTitles.length, 0);
    assert.equal(upsertCalls.length, 0);
  } finally {
    fetchMock.restore();
  }
});
