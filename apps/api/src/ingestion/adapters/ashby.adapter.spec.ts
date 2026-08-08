import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../../database/database.service";
import { IngestionFetchError } from "../errors";
import type {
  SemanticFilterDecision,
  SemanticFilterService,
} from "../semantic-filter.service";
import type { JobSourceContext } from "../types";
import { AshbyAdapter } from "./ashby.adapter";

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
    parserKey: "ashby",
    sourceName: "Ashby Source",
    sourceType: "ashby",
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

test("AshbyAdapter maps observation fields from the job board API", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        apiVersion: "1",
        jobs: [
          {
            id: "26140397-e042-4d2e-9c84-9ee400de6da9",
            title: "Lead Software Engineer - Reliability",
            department: "Engineer",
            team: "Engineer",
            employmentType: "FullTime",
            location: "Miami",
            publishedAt: "2026-07-20T11:35:01.642+00:00",
            isRemote: true,
            workplaceType: "Hybrid",
            address: {
              postalAddress: {
                addressRegion: "Florida",
                addressCountry: "United States",
                addressLocality: "Miami",
              },
            },
            jobUrl: "https://jobs.ashbyhq.com/nubank/26140397",
            descriptionHtml: "<p>Descricao</p>",
            descriptionPlain: "Descricao em texto puro",
          },
        ],
      },
    },
  ]);

  try {
    const adapter = new AshbyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://api.ashbyhq.com/posting-api/job-board/nubank",
      ),
    );

    assert.equal(observations.length, 1);
    assert.equal(
      observations[0]?.canonicalKey,
      "ashby:nubank:26140397-e042-4d2e-9c84-9ee400de6da9",
    );
    assert.equal(
      observations[0]?.sourceJobUrl,
      "https://jobs.ashbyhq.com/nubank/26140397",
    );
    assert.equal(observations[0]?.city, "Miami");
    assert.equal(observations[0]?.state, "Florida");
    assert.equal(observations[0]?.country, "United States");
    assert.equal(observations[0]?.department, "Engineer");
    assert.equal(observations[0]?.employmentType, "full_time");
    assert.equal(observations[0]?.employmentTypeRaw, "FullTime");
    assert.equal(observations[0]?.workModel, "remote");
    assert.equal(
      observations[0]?.descriptionClean,
      "Descricao em texto puro",
    );
    assert.equal(observations[0]?.descriptionRaw, "<p>Descricao</p>");
    assert.equal(fetchMock.calls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("AshbyAdapter infers workModel hybrid/onsite from workplaceType when not remote", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobs: [
          {
            id: "1",
            title: "Vaga Hibrida",
            workplaceType: "Hybrid",
            isRemote: false,
          },
          {
            id: "2",
            title: "Vaga Presencial",
            workplaceType: "Onsite",
            isRemote: false,
          },
        ],
      },
    },
  ]);

  try {
    const adapter = new AshbyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://api.ashbyhq.com/posting-api/job-board/nubank",
      ),
    );

    assert.equal(observations[0]?.workModel, "hybrid");
    assert.equal(observations[1]?.workModel, "onsite");
  } finally {
    fetchMock.restore();
  }
});

test("AshbyAdapter falls back descriptionClean to title when descriptionPlain is empty", async () => {
  const fetchMock = createFetchMock([
    {
      json: { jobs: [{ id: "1", title: "Vaga Sem Descricao" }] },
    },
  ]);

  try {
    const adapter = new AshbyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://api.ashbyhq.com/posting-api/job-board/nubank",
      ),
    );

    assert.equal(observations[0]?.descriptionClean, "Vaga Sem Descricao");
  } finally {
    fetchMock.restore();
  }
});

test("AshbyAdapter saves CrawlerDiscardedTitle for noise_signal jobs", async () => {
  const fetchMock = createFetchMock([
    { json: { jobs: [{ id: "1", title: "Enfermeiro Plantonista" }] } },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock({
      configVersion: "v1",
      reason: "noise_signal:enfermeiro",
      result: "SKIP",
    });
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new AshbyAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext(
        "https://api.ashbyhq.com/posting-api/job-board/nubank",
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

test("AshbyAdapter skips semantic filter for existing (dedup) jobs and keeps full data", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobs: [
          {
            id: "1",
            title: "Desenvolvedor Backend",
            descriptionPlain: "Descricao completa",
          },
        ],
      },
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock();
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new AshbyAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext(
        "https://api.ashbyhq.com/posting-api/job-board/nubank",
      ),
      { getExistingJobByCanonicalKey: async () => ({ lastSeenAt: new Date() }) },
    );

    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.descriptionClean, "Descricao completa");
    assert.equal(evaluatedTitles.length, 0);
    assert.equal(upsertCalls.length, 0);
  } finally {
    fetchMock.restore();
  }
});

test("AshbyAdapter throws typed error when board API responds 403", async () => {
  const fetchMock = createFetchMock([{ status: 403, json: { message: "forbidden" } }]);

  try {
    const adapter = new AshbyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () =>
        adapter.collect(
          createJobSourceContext(
            "https://api.ashbyhq.com/posting-api/job-board/nubank",
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

test("AshbyAdapter throws typed error when board API responds 404", async () => {
  const fetchMock = createFetchMock([{ status: 404, json: { message: "not found" } }]);

  try {
    const adapter = new AshbyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () =>
        adapter.collect(
          createJobSourceContext(
            "https://api.ashbyhq.com/posting-api/job-board/cloudwalk",
          ),
        ),
      (error) => {
        assert.equal(error instanceof IngestionFetchError, true);
        assert.equal((error as IngestionFetchError).statusCode, 404);
        return true;
      },
    );
  } finally {
    fetchMock.restore();
  }
});

test("AshbyAdapter retries once on 429 and succeeds", async () => {
  const fetchMock = createFetchMock([
    { status: 429, json: { message: "too many requests" } },
    { json: { jobs: [{ id: "1", title: "Vaga" }] } },
  ]);

  try {
    const adapter = new AshbyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://api.ashbyhq.com/posting-api/job-board/nubank",
      ),
    );

    assert.equal(observations.length, 1);
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("AshbyAdapter extracts the slug from the public jobs.ashbyhq.com URL, not just the API URL", async () => {
  const fetchMock = createFetchMock([
    { json: { jobs: [{ id: "1", title: "Vaga" }] } },
  ]);

  try {
    const adapter = new AshbyAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://jobs.ashbyhq.com/nubank"),
    );

    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.canonicalKey, "ashby:nubank:1");
    assert.equal(
      fetchMock.calls[0]?.toString(),
      "https://api.ashbyhq.com/posting-api/job-board/nubank",
    );
  } finally {
    fetchMock.restore();
  }
});

test("AshbyAdapter throws an actionable error for an invalid sourceUrl", async () => {
  const adapter = new AshbyAdapter(
    createSemanticFilterMock().semanticFilter,
    createDatabaseMock().database,
  );

  await assert.rejects(
    () => adapter.collect(createJobSourceContext("https://careers.example.com")),
    /Invalid Ashby sourceUrl/,
  );
});
