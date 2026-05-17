import assert from "node:assert/strict";
import { test } from "node:test";

import type { JobSourceContext } from "../types";
import { GupyAdapter } from "./gupy.adapter";

type MockResponse = {
  status?: number;
  json?: unknown;
};

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
    const adapter = new GupyAdapter();
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
    const adapter = new GupyAdapter();
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
  const adapter = new GupyAdapter();

  await assert.rejects(
    () =>
      adapter.collect(
        createJobSourceContext("https://careers.example.com/jobs"),
      ),
    /gupy sourceUrl must point to \{subdomain\}\.gupy\.io/i,
  );
});
