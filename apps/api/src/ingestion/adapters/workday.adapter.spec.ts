import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../../database/database.service";
import { IngestionFetchError } from "../errors";
import type {
  SemanticFilterDecision,
  SemanticFilterService,
} from "../semantic-filter.service";
import type { JobSourceContext } from "../types";
import { WorkdayAdapter } from "./workday.adapter";

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
    parserKey: "workday",
    sourceName: "Workday Source",
    sourceType: "workday",
    sourceUrl,
  };
}

function createFetchMock(sequence: MockResponse[]) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: URL; method?: string }> = [];
  let index = 0;

  globalThis.fetch = (async (
    input: URL | RequestInfo,
    init?: RequestInit,
  ) => {
    const callUrl = new URL(
      typeof input === "string" ? input : input.toString(),
    );
    calls.push({ url: callUrl, method: init?.method });

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

test("WorkdayAdapter paginates the listing (offset/limit) then fetches the detail for a new job", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        total: 1,
        jobPostings: [
          {
            title: "Investment Banking Analyst",
            externalPath: "/job/Madison-Ave-Corp/Investment-Banking-Analyst_Req1555604",
            locationsText: "Madison Ave Corp",
            postedOn: "Posted 2 Days Ago",
            bulletFields: ["Req1555604"],
          },
        ],
      },
    },
    {
      json: {
        jobPostingInfo: {
          title: "Investment Banking Analyst",
          jobDescription: "<p>Descricao completa</p>",
          location: "Madison Ave Corp",
          startDate: "2026-08-06",
          timeType: "Full time",
          country: { descriptor: "United States of America" },
          jobRequisitionLocation: { descriptor: "Madison Ave Corp" },
        },
      },
    },
  ]);

  try {
    const adapter = new WorkdayAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://santander.wd3.myworkdayjobs.com/pt-BR/SantanderCareers",
      ),
    );

    assert.equal(observations.length, 1);
    assert.equal(
      observations[0]?.canonicalKey,
      "workday:santander:SantanderCareers:Req1555604",
    );
    assert.equal(observations[0]?.title, "Investment Banking Analyst");
    assert.equal(observations[0]?.country, "United States of America");
    assert.equal(observations[0]?.employmentType, "Full time");
    assert.equal(
      observations[0]?.descriptionClean.includes("Descricao completa"),
      true,
    );
    assert.equal(
      observations[0]?.sourceJobUrl,
      "https://santander.wd3.myworkdayjobs.com/SantanderCareers/job/Madison-Ave-Corp/Investment-Banking-Analyst_Req1555604",
    );

    assert.equal(fetchMock.calls.length, 2);
    assert.equal(fetchMock.calls[0]?.method, "POST");
    assert.equal(
      fetchMock.calls[0]?.url.toString(),
      "https://santander.wd3.myworkdayjobs.com/wday/cxs/santander/SantanderCareers/jobs",
    );
    assert.equal(
      fetchMock.calls[1]?.url.toString(),
      "https://santander.wd3.myworkdayjobs.com/wday/cxs/santander/SantanderCareers/job/Madison-Ave-Corp/Investment-Banking-Analyst_Req1555604",
    );
  } finally {
    fetchMock.restore();
  }
});

test("WorkdayAdapter accepts a different tenant instance number (wd501) and site name", async () => {
  const fetchMock = createFetchMock([
    { json: { total: 0, jobPostings: [] } },
  ]);

  try {
    const adapter = new WorkdayAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://natura.wd501.myworkdayjobs.com/pt-BR/NaturaCarreiras",
      ),
    );

    assert.deepEqual(observations, []);
    assert.equal(
      fetchMock.calls[0]?.url.toString(),
      "https://natura.wd501.myworkdayjobs.com/wday/cxs/natura/NaturaCarreiras/jobs",
    );
  } finally {
    fetchMock.restore();
  }
});

test("WorkdayAdapter saves CrawlerDiscardedTitle for noise_signal jobs without a detail-fetch", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        total: 1,
        jobPostings: [
          {
            title: "Enfermeiro Plantonista",
            externalPath: "/job/x/Enfermeiro_Req1",
            bulletFields: ["Req1"],
          },
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
    const adapter = new WorkdayAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext(
        "https://santander.wd3.myworkdayjobs.com/pt-BR/SantanderCareers",
      ),
      { getExistingJobByCanonicalKey: async () => null, ingestionRunId: "run-1" },
    );

    assert.equal(observations.length, 0);
    assert.deepEqual(evaluatedTitles, ["enfermeiro plantonista"]);
    assert.equal(upsertCalls.length, 1);
    assert.equal(fetchMock.calls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("WorkdayAdapter skips detail fetch for a fresh existing job", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        total: 1,
        jobPostings: [
          {
            title: "Analista de Dados",
            externalPath: "/job/x/Analista_Req1",
            bulletFields: ["Req1"],
          },
        ],
      },
    },
  ]);

  try {
    const adapter = new WorkdayAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://santander.wd3.myworkdayjobs.com/pt-BR/SantanderCareers",
      ),
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

test("WorkdayAdapter throws typed error when the jobs API responds 403", async () => {
  const fetchMock = createFetchMock([{ status: 403, json: {} }]);

  try {
    const adapter = new WorkdayAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () =>
        adapter.collect(
          createJobSourceContext(
            "https://santander.wd3.myworkdayjobs.com/pt-BR/SantanderCareers",
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

test("WorkdayAdapter retries once on 429 and succeeds", async () => {
  const fetchMock = createFetchMock([
    { status: 429, json: {} },
    { json: { total: 0, jobPostings: [] } },
  ]);

  try {
    const adapter = new WorkdayAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://santander.wd3.myworkdayjobs.com/pt-BR/SantanderCareers",
      ),
    );

    assert.deepEqual(observations, []);
    // fetchWithRetry ja absorve o 429 (1 call extra); a lista vem vazia,
    // entao o loop de paginacao ainda tenta 1x de novo antes de aceitar
    // como fim de lista (protecao contra pagina vazia transitoria).
    assert.equal(fetchMock.calls.length, 3);
  } finally {
    fetchMock.restore();
  }
});

// Achado real durante o smoke da Sprint 6C: o campo "total" do Workday
// nao e confiavel — paginas depois da primeira as vezes voltam total:0
// mesmo com jobPostings cheio, o que cortava a paginacao cedo (Santander:
// 40 vagas processadas de 898; Natura: so 7). A paginacao agora ignora
// "total" e usa o tamanho da pagina (< PAGE_LIMIT = ultima pagina).
test("WorkdayAdapter keeps paginating even when the API returns an unreliable total:0 on later pages", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        total: 898,
        jobPostings: Array.from({ length: 20 }, (_, i) => ({
          title: `Vaga ${i}`,
          externalPath: `/job/x/Vaga-${i}_Req${i}`,
          bulletFields: [`Req${i}`],
        })),
      },
    },
    {
      // pagina real do Workday: total volta 0 mesmo com vagas de verdade
      json: {
        total: 0,
        jobPostings: Array.from({ length: 20 }, (_, i) => ({
          title: `Vaga ${20 + i}`,
          externalPath: `/job/x/Vaga-${20 + i}_Req${20 + i}`,
          bulletFields: [`Req${20 + i}`],
        })),
      },
    },
    {
      // pagina parcial (< PAGE_LIMIT) = fim real da lista
      json: {
        total: 0,
        jobPostings: [
          { title: "Vaga 40", externalPath: "/job/x/Vaga-40_Req40", bulletFields: ["Req40"] },
        ],
      },
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock({
      configVersion: "v1",
      reason: "noise_signal:mock",
      result: "SKIP",
    });
    const { database } = createDatabaseMock();
    const adapter = new WorkdayAdapter(semanticFilter, database);

    await adapter.collect(
      createJobSourceContext(
        "https://santander.wd3.myworkdayjobs.com/pt-BR/SantanderCareers",
      ),
      { getExistingJobByCanonicalKey: async () => null },
    );

    // 3 chamadas de listagem (20 + 20 + 1 vagas), sem parar cedo por
    // causa do total:0 nas paginas 2 e 3.
    assert.equal(fetchMock.calls.length, 3);
    assert.equal(evaluatedTitles.length, 41);
  } finally {
    fetchMock.restore();
  }
});

test("WorkdayAdapter throws an actionable error for an invalid sourceUrl", async () => {
  const adapter = new WorkdayAdapter(
    createSemanticFilterMock().semanticFilter,
    createDatabaseMock().database,
  );

  await assert.rejects(
    () => adapter.collect(createJobSourceContext("https://careers.example.com")),
    /Invalid Workday sourceUrl/,
  );
});
