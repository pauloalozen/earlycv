import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../../database/database.service";
import { IngestionFetchError } from "../errors";
import type {
  SemanticFilterDecision,
  SemanticFilterService,
} from "../semantic-filter.service";
import type { JobSourceContext } from "../types";
import { GreenhouseAdapter } from "./greenhouse.adapter";

type MockResponse = {
  status?: number;
  json?: unknown;
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

function createDatabaseMock() {
  const upsertCalls: unknown[] = [];
  const database = {
    crawlerDiscardedTitle: {
      upsert: async (args: unknown) => {
        upsertCalls.push(args);
        return {};
      },
    },
  } as unknown as DatabaseService;

  return { database, upsertCalls };
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
    parserKey: "greenhouse",
    sourceName: "Greenhouse Source",
    sourceType: "greenhouse",
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
    } as Response;
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("GreenhouseAdapter maps observation fields from the board API", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobs: [
          {
            id: 6100504004,
            title: "Pessoa Engenheira Backend",
            absolute_url: "https://job-boards.greenhouse.io/vtex/jobs/6100504004",
            content: "<p>Descricao&nbsp;da vaga</p>",
            location: { name: "Sao Paulo, SP, Brasil" },
            departments: [{ name: "Tech" }],
            updated_at: "2026-08-05T10:06:06-04:00",
          },
        ],
        meta: { total: 1 },
      },
    },
  ]);

  try {
    const adapter = new GreenhouseAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://boards-api.greenhouse.io/v1/boards/vtex/jobs",
      ),
    );

    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.canonicalKey, "greenhouse:vtex:6100504004");
    assert.equal(
      observations[0]?.sourceJobUrl,
      "https://job-boards.greenhouse.io/vtex/jobs/6100504004",
    );
    assert.equal(observations[0]?.city, "São Paulo");
    assert.equal(observations[0]?.state, "SP");
    assert.equal(observations[0]?.country, "Brasil");
    assert.equal(observations[0]?.department, "Tech");
    assert.equal(observations[0]?.descriptionClean.includes("Descricao"), true);
    assert.equal(observations[0]?.externalJobId, "6100504004");
    assert.equal(fetchMock.calls.length, 1);
    assert.equal(fetchMock.calls[0]?.searchParams.get("content"), "true");
  } finally {
    fetchMock.restore();
  }
});

test("GreenhouseAdapter saves CrawlerDiscardedTitle for noise_signal jobs", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobs: [
          {
            id: 1,
            title: "Enfermeiro Plantonista",
            location: { name: "Remote" },
          },
        ],
        meta: { total: 1 },
      },
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock({
      configVersion: "v1",
      reason: "noise_signal:enfermeiro",
      result: "SKIP",
    });
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new GreenhouseAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext(
        "https://boards-api.greenhouse.io/v1/boards/vtex/jobs",
      ),
      { getExistingJobByCanonicalKey: async () => null, ingestionRunId: "run-1" },
    );

    assert.equal(observations.length, 0);
    assert.deepEqual(evaluatedTitles, ["enfermeiro plantonista"]);
    assert.equal(upsertCalls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("GreenhouseAdapter skips semantic filter for existing (dedup) jobs and keeps full data", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobs: [
          {
            id: 2,
            title: "Desenvolvedor Backend",
            content: "<p>Descricao completa</p>",
            location: { name: "Remote" },
          },
        ],
        meta: { total: 1 },
      },
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock();
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new GreenhouseAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext(
        "https://boards-api.greenhouse.io/v1/boards/vtex/jobs",
      ),
      {
        getExistingJobByCanonicalKey: async () => ({
          lastSeenAt: new Date(),
        }),
      },
    );

    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.descriptionClean.includes("Descricao completa"), true);
    assert.equal(evaluatedTitles.length, 0);
    assert.equal(upsertCalls.length, 0);
  } finally {
    fetchMock.restore();
  }
});

test("GreenhouseAdapter parses 'Sao Paulo, SP, Brasil' into city/state/country", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobs: [{ id: 3, title: "Vaga", location: { name: "Sao Paulo, SP, Brasil" } }],
        meta: { total: 1 },
      },
    },
  ]);

  try {
    const adapter = new GreenhouseAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://boards-api.greenhouse.io/v1/boards/vtex/jobs",
      ),
    );

    assert.equal(observations[0]?.city, "São Paulo");
    assert.equal(observations[0]?.state, "SP");
    assert.equal(observations[0]?.country, "Brasil");
  } finally {
    fetchMock.restore();
  }
});

test("GreenhouseAdapter parses 'Remote' location as workModel remote with no city/state", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobs: [{ id: 4, title: "Vaga Remota", location: { name: "Remote" } }],
        meta: { total: 1 },
      },
    },
  ]);

  try {
    const adapter = new GreenhouseAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://boards-api.greenhouse.io/v1/boards/vtex/jobs",
      ),
    );

    assert.equal(observations[0]?.city, undefined);
    assert.equal(observations[0]?.state, undefined);
    assert.equal(observations[0]?.workModel, "remote");
  } finally {
    fetchMock.restore();
  }
});

test("GreenhouseAdapter strips HTML tags and decodes entities in descriptionClean", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobs: [
          {
            id: 5,
            title: "Vaga",
            content: "<p>Ola &amp; bem-vindo</p><ul><li>Item 1</li></ul>",
            location: { name: "Remote" },
          },
        ],
        meta: { total: 1 },
      },
    },
  ]);

  try {
    const adapter = new GreenhouseAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://boards-api.greenhouse.io/v1/boards/vtex/jobs",
      ),
    );

    assert.equal(observations[0]?.descriptionClean.includes("<"), false);
    assert.equal(observations[0]?.descriptionClean.includes("Ola & bem-vindo"), true);
    assert.equal(observations[0]?.descriptionClean.includes("Item 1"), true);
  } finally {
    fetchMock.restore();
  }
});

test("GreenhouseAdapter falls back descriptionClean to title when content is empty", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobs: [{ id: 6, title: "Vaga Sem Descricao", location: { name: "Remote" } }],
        meta: { total: 1 },
      },
    },
  ]);

  try {
    const adapter = new GreenhouseAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://boards-api.greenhouse.io/v1/boards/vtex/jobs",
      ),
    );

    assert.equal(observations[0]?.descriptionClean, "Vaga Sem Descricao");
  } finally {
    fetchMock.restore();
  }
});

test("GreenhouseAdapter throws typed error when board API responds 403", async () => {
  const fetchMock = createFetchMock([{ status: 403, json: { message: "forbidden" } }]);

  try {
    const adapter = new GreenhouseAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () =>
        adapter.collect(
          createJobSourceContext(
            "https://boards-api.greenhouse.io/v1/boards/vtex/jobs",
          ),
        ),
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

test("GreenhouseAdapter retries once on 429 and succeeds", async () => {
  const fetchMock = createFetchMock([
    { status: 429, json: { message: "too many requests" } },
    {
      json: {
        jobs: [{ id: 7, title: "Vaga", location: { name: "Remote" } }],
        meta: { total: 1 },
      },
    },
  ]);

  try {
    const adapter = new GreenhouseAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://boards-api.greenhouse.io/v1/boards/vtex/jobs",
      ),
    );

    assert.equal(observations.length, 1);
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("GreenhouseAdapter extracts the slug from the public job-boards.greenhouse.io URL, not just the API URL", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobs: [{ id: 1, title: "Vaga", location: { name: "Remote" } }],
        meta: { total: 1 },
      },
    },
  ]);

  try {
    const adapter = new GreenhouseAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://job-boards.greenhouse.io/vtex"),
    );

    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.canonicalKey, "greenhouse:vtex:1");
    assert.equal(
      fetchMock.calls[0]?.toString(),
      "https://boards-api.greenhouse.io/v1/boards/vtex/jobs?content=true",
    );
  } finally {
    fetchMock.restore();
  }
});

test("GreenhouseAdapter throws an actionable error for an invalid sourceUrl", async () => {
  const adapter = new GreenhouseAdapter(
    createSemanticFilterMock().semanticFilter,
    createDatabaseMock().database,
  );

  await assert.rejects(
    () => adapter.collect(createJobSourceContext("https://careers.example.com")),
    /Invalid Greenhouse sourceUrl/,
  );
});
