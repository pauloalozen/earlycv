import assert from "node:assert/strict";
import { test } from "node:test";

import { IngestionFetchError } from "../errors";
import type { JobSourceContext } from "../types";
import { GupyAdapter } from "./gupy.adapter";

type MockResponse = {
  status?: number;
  json?: unknown;
  text?: string;
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

test("GupyAdapter throws typed error when board API responds 403", async () => {
  const fetchMock = createFetchMock([
    {
      status: 403,
      json: { message: "forbidden" },
    },
  ]);

  try {
    const adapter = new GupyAdapter();

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
    const adapter = new GupyAdapter();
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
    const adapter = new GupyAdapter();
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
    const adapter = new GupyAdapter();
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
    const adapter = new GupyAdapter();
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
    const adapter = new GupyAdapter();
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
