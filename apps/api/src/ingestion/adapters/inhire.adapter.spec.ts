import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../../database/database.service";
import { IngestionFetchError } from "../errors";
import type {
  SemanticFilterDecision,
  SemanticFilterService,
} from "../semantic-filter.service";
import type { JobSourceContext } from "../types";
import { InHireAdapter } from "./inhire.adapter";

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
    parserKey: "inhire",
    sourceName: "InHire Source",
    sourceType: "inhire",
    sourceUrl,
  };
}

function createFetchMock(sequence: MockResponse[]) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: URL; headers: Record<string, string> }> = [];
  let index = 0;

  globalThis.fetch = (async (
    input: URL | RequestInfo,
    init?: RequestInit,
  ) => {
    const callUrl = new URL(
      typeof input === "string" ? input : input.toString(),
    );
    calls.push({
      url: callUrl,
      headers: (init?.headers as Record<string, string>) ?? {},
    });

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

test("InHireAdapter fetches the listing then the detail for a new job, sending X-Tenant", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        tenantName: "Cielo",
        jobsPage: [
          {
            jobId: "job-1",
            displayName: "Advogado Especialista Regulatorio",
            status: "published",
            workplaceType: "Hybrid",
            location: "Barueri, SP, BR",
          },
        ],
      },
    },
    {
      json: {
        jobId: "job-1",
        displayName: "Advogado Especialista Regulatorio",
        status: "published",
        workplaceType: "Hybrid",
        location: "Barueri, SP, BR",
        contractType: ["CLT"],
        description: "<p>Descricao completa</p>",
        publishedAt: "2026-06-23T19:22:42.851Z",
      },
    },
  ]);

  try {
    const adapter = new InHireAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://cielo.inhire.app"),
      { getExistingJobByCanonicalKey: async () => null },
    );

    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.canonicalKey, "inhire:cielo:job-1");
    assert.equal(observations[0]?.city, "Barueri");
    assert.equal(observations[0]?.state, "SP");
    assert.equal(observations[0]?.country, "BR");
    assert.equal(observations[0]?.workModel, "hybrid");
    assert.equal(observations[0]?.employmentType, "clt");
    assert.equal(
      observations[0]?.descriptionClean.includes("Descricao completa"),
      true,
    );
    assert.equal(observations[0]?.detailFetchSkipped, undefined);
    assert.equal(fetchMock.calls.length, 2);
    assert.equal(fetchMock.calls[0]?.headers["X-Tenant"], "cielo");
    assert.equal(fetchMock.calls[1]?.headers["X-Tenant"], "cielo");
    assert.equal(
      fetchMock.calls[1]?.url.toString(),
      "https://api.inhire.app/job-posts/public/pages/job-1",
    );
  } finally {
    fetchMock.restore();
  }
});

test("InHireAdapter skips detail fetch for a fresh existing job", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobsPage: [
          {
            jobId: "job-1",
            displayName: "Vaga Existente",
            status: "published",
            workplaceType: "Remote",
            location: "Sao Paulo, SP, BR",
          },
        ],
      },
    },
  ]);

  try {
    const adapter = new InHireAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://cielo.inhire.app"),
      {
        getExistingJobByCanonicalKey: async () => ({
          lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
        }),
      },
    );

    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.detailFetchSkipped, true);
    assert.equal(fetchMock.calls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("InHireAdapter fetches detail for a stale existing job", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobsPage: [
          {
            jobId: "job-1",
            displayName: "Vaga Existente",
            status: "published",
          },
        ],
      },
    },
    {
      json: {
        jobId: "job-1",
        displayName: "Vaga Existente",
        description: "<p>Desc</p>",
        publishedAt: "2026-06-23T19:22:42.851Z",
      },
    },
  ]);

  try {
    const adapter = new InHireAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://cielo.inhire.app"),
      {
        getExistingJobByCanonicalKey: async () => ({
          lastSeenAt: new Date("2024-01-01T10:00:00.000Z"),
        }),
      },
    );

    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.detailFetchSkipped, undefined);
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("InHireAdapter discards a new job on noise_signal without a detail-fetch", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobsPage: [
          { jobId: "job-1", displayName: "Enfermeiro Plantonista", status: "published" },
        ],
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
    const adapter = new InHireAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://cielo.inhire.app"),
      { getExistingJobByCanonicalKey: async () => null, ingestionRunId: "run-1" },
    );

    assert.equal(observations.length, 0);
    assert.equal(fetchMock.calls.length, 1);
    assert.deepEqual(evaluatedTitles, ["enfermeiro plantonista"]);
    assert.equal(upsertCalls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("InHireAdapter does not evaluate semantic filter for existing (dedup) jobs", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobsPage: [
          { jobId: "job-1", displayName: "Vaga Existente", status: "published" },
        ],
      },
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock();
    const { database } = createDatabaseMock();
    const adapter = new InHireAdapter(semanticFilter, database);

    await adapter.collect(createJobSourceContext("https://cielo.inhire.app"), {
      getExistingJobByCanonicalKey: async () => ({
        lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
      }),
    });

    assert.equal(evaluatedTitles.length, 0);
  } finally {
    fetchMock.restore();
  }
});

test("InHireAdapter filters out non-published jobs from the listing", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        jobsPage: [
          { jobId: "job-1", displayName: "Vaga Rascunho", status: "draft" },
        ],
      },
    },
  ]);

  try {
    const adapter = new InHireAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://cielo.inhire.app"),
    );

    assert.equal(observations.length, 0);
    assert.equal(fetchMock.calls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("InHireAdapter throws typed error when the listing responds 403", async () => {
  const fetchMock = createFetchMock([{ status: 403, json: { message: "forbidden" } }]);

  try {
    const adapter = new InHireAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () => adapter.collect(createJobSourceContext("https://cielo.inhire.app")),
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

test("InHireAdapter throws typed error when a detail request responds 403", async () => {
  const fetchMock = createFetchMock([
    { json: { jobsPage: [{ jobId: "job-1", displayName: "Vaga", status: "published" }] } },
    { status: 403, json: { message: "forbidden" } },
  ]);

  try {
    const adapter = new InHireAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () => adapter.collect(createJobSourceContext("https://cielo.inhire.app")),
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

test("InHireAdapter retries once on 429 and succeeds", async () => {
  const fetchMock = createFetchMock([
    { status: 429, json: { message: "too many requests" } },
    { json: { jobsPage: [] } },
  ]);

  try {
    const adapter = new InHireAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://cielo.inhire.app"),
    );

    assert.deepEqual(observations, []);
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("InHireAdapter throws an actionable error for an invalid sourceUrl", async () => {
  const adapter = new InHireAdapter(
    createSemanticFilterMock().semanticFilter,
    createDatabaseMock().database,
  );

  await assert.rejects(
    () => adapter.collect(createJobSourceContext("https://careers.example.com")),
    /Invalid InHire sourceUrl/,
  );
});
