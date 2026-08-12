import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../../database/database.service";
import { IngestionFetchError } from "../errors";
import type {
  SemanticFilterDecision,
  SemanticFilterService,
} from "../semantic-filter.service";
import type { JobSourceContext } from "../types";
import { TeamtailorAdapter } from "./teamtailor.adapter";

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
    parserKey: "teamtailor",
    sourceName: "Teamtailor Source",
    sourceType: "teamtailor",
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

test("TeamtailorAdapter maps observation fields from the jobs.json feed", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        version: "https://jsonfeed.org/version/1.1",
        title: "Loft",
        items: [
          {
            id: "d021ca8f-aeb9-43f5-b09c-7b9fa31f2d78",
            title: "Analista de Suporte",
            url: "https://loft.teamtailor.com/jobs/8194079-analista-de-suporte",
            date_published: "2026-08-07T16:44:52-03:00",
            content_html: "<p>Descricao <strong>completa</strong></p>",
            _jobposting: {
              description: "<p>Descricao <strong>completa</strong></p>",
              jobLocation: [
                {
                  address: {
                    addressLocality: "Sao Paulo",
                    addressRegion: "Sao Paulo - SP",
                    addressCountry: "BR",
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ]);

  try {
    const adapter = new TeamtailorAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://loft.teamtailor.com/jobs.json"),
    );

    assert.equal(observations.length, 1);
    assert.equal(
      observations[0]?.canonicalKey,
      "teamtailor:loft:d021ca8f-aeb9-43f5-b09c-7b9fa31f2d78",
    );
    assert.equal(
      observations[0]?.sourceJobUrl,
      "https://loft.teamtailor.com/jobs/8194079-analista-de-suporte",
    );
    assert.equal(observations[0]?.city, "São Paulo");
    assert.equal(observations[0]?.state, "Sao Paulo - SP");
    assert.equal(observations[0]?.country, "BR");
    assert.equal(observations[0]?.descriptionClean.includes("Descricao"), true);
    assert.equal(observations[0]?.descriptionClean.includes("<"), false);
    assert.equal(
      observations[0]?.descriptionRaw,
      "<p>Descricao <strong>completa</strong></p>",
    );
    assert.equal(fetchMock.calls.length, 1);
    assert.equal(fetchMock.calls[0]?.hostname, "loft.teamtailor.com");
  } finally {
    fetchMock.restore();
  }
});

test("TeamtailorAdapter infers workModel remote from location/description text", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        items: [
          {
            id: "1",
            title: "Vaga Remota",
            content_html: "<p>Trabalho 100% remoto</p>",
          },
        ],
      },
    },
  ]);

  try {
    const adapter = new TeamtailorAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://loft.teamtailor.com/jobs.json"),
    );

    assert.equal(observations[0]?.workModel, "remote");
  } finally {
    fetchMock.restore();
  }
});

test("TeamtailorAdapter falls back descriptionClean to title when content_html is empty", async () => {
  const fetchMock = createFetchMock([
    { json: { items: [{ id: "1", title: "Vaga Sem Descricao" }] } },
  ]);

  try {
    const adapter = new TeamtailorAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://loft.teamtailor.com/jobs.json"),
    );

    assert.equal(observations[0]?.descriptionClean, "Vaga Sem Descricao");
  } finally {
    fetchMock.restore();
  }
});

test("TeamtailorAdapter saves CrawlerDiscardedTitle for noise_signal jobs", async () => {
  const fetchMock = createFetchMock([
    { json: { items: [{ id: "1", title: "Enfermeiro Plantonista" }] } },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock({
      configVersion: "v1",
      reason: "noise_signal:enfermeiro",
      result: "SKIP",
    });
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new TeamtailorAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://loft.teamtailor.com/jobs.json"),
      { getExistingJobByCanonicalKey: async () => null, ingestionRunId: "run-1" },
    );

    assert.equal(observations.length, 0);
    assert.deepEqual(evaluatedTitles, ["enfermeiro plantonista"]);
    assert.equal(upsertCalls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("TeamtailorAdapter skips semantic filter for existing (dedup) jobs and keeps full data", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        items: [
          {
            id: "1",
            title: "Desenvolvedor Backend",
            content_html: "<p>Descricao completa</p>",
          },
        ],
      },
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock();
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new TeamtailorAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://loft.teamtailor.com/jobs.json"),
      { getExistingJobByCanonicalKey: async () => ({ lastSeenAt: new Date() }) },
    );

    assert.equal(observations.length, 1);
    assert.equal(
      observations[0]?.descriptionClean.includes("Descricao completa"),
      true,
    );
    assert.equal(evaluatedTitles.length, 0);
    assert.equal(upsertCalls.length, 0);
  } finally {
    fetchMock.restore();
  }
});

test("TeamtailorAdapter throws typed error when jobs feed responds 403", async () => {
  const fetchMock = createFetchMock([{ status: 403, json: { message: "forbidden" } }]);

  try {
    const adapter = new TeamtailorAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () =>
        adapter.collect(
          createJobSourceContext("https://loft.teamtailor.com/jobs.json"),
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

test("TeamtailorAdapter retries once on 429 and succeeds", async () => {
  const fetchMock = createFetchMock([
    { status: 429, json: { message: "too many requests" } },
    { json: { items: [{ id: "1", title: "Vaga" }] } },
  ]);

  try {
    const adapter = new TeamtailorAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://loft.teamtailor.com/jobs.json"),
    );

    assert.equal(observations.length, 1);
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("TeamtailorAdapter throws an actionable error for an invalid sourceUrl", async () => {
  const adapter = new TeamtailorAdapter(
    createSemanticFilterMock().semanticFilter,
    createDatabaseMock().database,
  );

  await assert.rejects(
    () => adapter.collect(createJobSourceContext("https://careers.example.com")),
    /Invalid Teamtailor sourceUrl/,
  );
});
