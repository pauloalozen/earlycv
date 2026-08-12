import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../../database/database.service";
import { IngestionFetchError } from "../errors";
import type {
  SemanticFilterDecision,
  SemanticFilterService,
} from "../semantic-filter.service";
import type { JobSourceContext } from "../types";
import { LeverAdapter } from "./lever.adapter";

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
    parserKey: "lever",
    sourceName: "Lever Source",
    sourceType: "lever",
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
      json: async () => entry?.json ?? [],
    } as Response;
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("LeverAdapter maps observation fields from the postings API", async () => {
  const fetchMock = createFetchMock([
    {
      json: [
        {
          id: "948f8e92-d7fa-436a-91bf-a3e9bb680dc8",
          text: "Analista de CRM Senior",
          descriptionPlain: "Descricao em texto puro",
          description: "<p>Descricao em texto puro</p>",
          lists: [{ text: "Requisitos", content: "<p>Item</p>" }],
          categories: {
            commitment: "CLT",
            department: "Product & Marketing",
            location: "Remoto",
          },
          country: "BR",
          workplaceType: "remote",
          createdAt: 1784906150481,
          hostedUrl: "https://jobs.lever.co/neon/948f8e92-d7fa-436a-91bf-a3e9bb680dc8",
        },
      ],
    },
  ]);

  try {
    const adapter = new LeverAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://api.lever.co/v0/postings/neon"),
    );

    assert.equal(observations.length, 1);
    assert.equal(
      observations[0]?.canonicalKey,
      "lever:neon:948f8e92-d7fa-436a-91bf-a3e9bb680dc8",
    );
    assert.equal(
      observations[0]?.sourceJobUrl,
      "https://jobs.lever.co/neon/948f8e92-d7fa-436a-91bf-a3e9bb680dc8",
    );
    assert.equal(observations[0]?.department, "Product & Marketing");
    assert.equal(observations[0]?.employmentType, "CLT");
    assert.equal(observations[0]?.country, "BR");
    assert.equal(observations[0]?.workModel, "remote");
    assert.equal(observations[0]?.externalJobId, "948f8e92-d7fa-436a-91bf-a3e9bb680dc8");
    assert.equal(observations[0]?.publishedAtSource, new Date(1784906150481).toISOString());
    assert.equal(observations[0]?.descriptionClean.includes("Descricao em texto puro"), true);
    assert.equal(observations[0]?.descriptionClean.includes("Requisitos"), true);
    assert.equal(fetchMock.calls.length, 1);
    assert.equal(fetchMock.calls[0]?.searchParams.get("mode"), "json");
  } finally {
    fetchMock.restore();
  }
});

test("LeverAdapter saves CrawlerDiscardedTitle for noise_signal postings", async () => {
  const fetchMock = createFetchMock([
    {
      json: [
        {
          id: "p1",
          text: "Enfermeiro Plantonista",
          categories: { location: "Remoto" },
        },
      ],
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock({
      configVersion: "v1",
      reason: "noise_signal:enfermeiro",
      result: "SKIP",
    });
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new LeverAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://api.lever.co/v0/postings/neon"),
      { getExistingJobByCanonicalKey: async () => null, ingestionRunId: "run-1" },
    );

    assert.equal(observations.length, 0);
    assert.deepEqual(evaluatedTitles, ["enfermeiro plantonista"]);
    assert.equal(upsertCalls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("LeverAdapter skips semantic filter for existing (dedup) postings and keeps full data", async () => {
  const fetchMock = createFetchMock([
    {
      json: [
        {
          id: "p2",
          text: "Desenvolvedor Backend",
          descriptionPlain: "Descricao completa",
          categories: { location: "Remoto" },
        },
      ],
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock();
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new LeverAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://api.lever.co/v0/postings/neon"),
      {
        getExistingJobByCanonicalKey: async () => ({ lastSeenAt: new Date() }),
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

test("LeverAdapter concatenates descriptionPlain and lists into descriptionClean", async () => {
  const fetchMock = createFetchMock([
    {
      json: [
        {
          id: "p3",
          text: "Vaga",
          descriptionPlain: "Intro da vaga",
          lists: [
            { text: "Requisitos", content: "<p>Item 1</p><p>Item 2</p>" },
            { text: "Beneficios", content: "<p>Vale refeicao</p>" },
          ],
        },
      ],
    },
  ]);

  try {
    const adapter = new LeverAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://api.lever.co/v0/postings/neon"),
    );

    const clean = observations[0]?.descriptionClean ?? "";
    assert.equal(clean.includes("Intro da vaga"), true);
    assert.equal(clean.includes("Requisitos"), true);
    assert.equal(clean.includes("Item 1"), true);
    assert.equal(clean.includes("Beneficios"), true);
    assert.equal(clean.includes("<"), false);
  } finally {
    fetchMock.restore();
  }
});

test("LeverAdapter parses 'Sao Paulo, Brasil' location into city/country", async () => {
  const fetchMock = createFetchMock([
    {
      json: [
        { id: "p4", text: "Vaga", categories: { location: "Sao Paulo, Brasil" } },
      ],
    },
  ]);

  try {
    const adapter = new LeverAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://api.lever.co/v0/postings/neon"),
    );

    assert.equal(observations[0]?.city, "São Paulo");
    assert.equal(observations[0]?.country, "Brasil");
  } finally {
    fetchMock.restore();
  }
});

test("LeverAdapter infers workModel remote from workplaceType", async () => {
  const fetchMock = createFetchMock([
    {
      json: [
        {
          id: "p5",
          text: "Vaga",
          categories: { location: "Remoto" },
          workplaceType: "remote",
        },
      ],
    },
  ]);

  try {
    const adapter = new LeverAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://api.lever.co/v0/postings/neon"),
    );

    assert.equal(observations[0]?.workModel, "remote");
  } finally {
    fetchMock.restore();
  }
});

test("LeverAdapter throws typed error when postings API responds 403", async () => {
  const fetchMock = createFetchMock([{ status: 403, json: { message: "forbidden" } }]);

  try {
    const adapter = new LeverAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () =>
        adapter.collect(
          createJobSourceContext("https://api.lever.co/v0/postings/neon"),
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

test("LeverAdapter retries once on 429 and succeeds", async () => {
  const fetchMock = createFetchMock([
    { status: 429, json: { message: "too many requests" } },
    { json: [{ id: "p6", text: "Vaga", categories: { location: "Remoto" } }] },
  ]);

  try {
    const adapter = new LeverAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://api.lever.co/v0/postings/neon"),
    );

    assert.equal(observations.length, 1);
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("LeverAdapter throws an actionable error for an invalid sourceUrl", async () => {
  const adapter = new LeverAdapter(
    createSemanticFilterMock().semanticFilter,
    createDatabaseMock().database,
  );

  await assert.rejects(
    () => adapter.collect(createJobSourceContext("https://careers.example.com")),
    /Invalid Lever sourceUrl/,
  );
});
