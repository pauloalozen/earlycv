import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../../database/database.service";
import { IngestionFetchError } from "../errors";
import type {
  SemanticFilterDecision,
  SemanticFilterService,
} from "../semantic-filter.service";
import type { JobSourceContext } from "../types";
import {
  buildSolidesJobUrl,
  extractSolidesSlug,
  SolidesAdapter,
} from "./solides.adapter";

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
    consecutive403Count: 0,
    crawlStrategy: "api",
    id: "job-source-id",
    parserKey: "solides",
    pauseReason: null,
    pausedUntil: null,
    sourceName: "Solides Source",
    sourceType: "solides",
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

function page(
  vacancies: unknown[],
  meta: { count?: number; currentPage?: number; totalPages?: number } = {},
) {
  return {
    json: {
      success: true,
      errors: [],
      data: {
        count: meta.count ?? vacancies.length,
        currentPage: meta.currentPage ?? 1,
        data: vacancies,
        totalPages: meta.totalPages ?? 1,
      },
    },
  };
}

const ELEVATO_VACANCY = {
  id: 933433,
  title: "Analista de Dados - Porto Alegre/RS",
  description:
    "<p>Responsável por <strong>dashboards</strong> em Power BI.</p>",
  createdAt: "2026-10-06",
  slug: "grupoelevato",
  isHiddenJob: false,
  homeOffice: false,
  jobType: "hibrido",
  city: { id: 1, name: "Porto Alegre", state_id: 23 },
  state: { id: 23, name: "Rio Grande do Sul", code: "RS" },
  address: {
    city: { id: 1, name: "Porto Alegre" },
    state: { id: 23, name: "Rio Grande do Sul", code: "RS" },
    country: { id: 30, name: "Brasil", code: "BR" },
  },
  recruitmentContractType: [{ id: 10, name: "CLT" }],
  occupationAreas: [{ id: 2, name: "Tecnologia" }],
};

test("extractSolidesSlug reads the tenant subdomain", () => {
  assert.equal(
    extractSolidesSlug("https://grupoelevato.vagas.solides.com.br/"),
    "grupoelevato",
  );
  assert.equal(
    buildSolidesJobUrl("grupoelevato", 933433),
    "https://grupoelevato.vagas.solides.com.br/vaga/933433",
  );
});

test("SolidesAdapter maps observation fields from the public vacancy API", async () => {
  const fetchMock = createFetchMock([page([ELEVATO_VACANCY])]);

  try {
    const adapter = new SolidesAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://grupoelevato.vagas.solides.com.br"),
    );

    assert.equal(observations.length, 1);
    const [observation] = observations;
    assert.equal(observation?.canonicalKey, "solides:grupoelevato:933433");
    assert.equal(observation?.externalJobId, "933433");
    assert.equal(observation?.title, "Analista de Dados - Porto Alegre/RS");
    assert.equal(
      observation?.sourceJobUrl,
      "https://grupoelevato.vagas.solides.com.br/vaga/933433",
    );
    assert.equal(observation?.city, "Porto Alegre");
    assert.equal(observation?.state, "RS");
    assert.equal(observation?.country, "Brasil");
    assert.equal(observation?.locationText, "Porto Alegre, RS, Brasil");
    assert.equal(observation?.workModel, "hybrid");
    assert.equal(observation?.employmentType, "full_time");
    assert.equal(observation?.employmentTypeRaw, "CLT");
    assert.equal(observation?.department, "Tecnologia");
    assert.match(observation?.descriptionClean ?? "", /dashboards em Power BI/);
    assert.equal(observation?.publishedAtSource, "2026-10-06T00:00:00.000Z");

    const [call] = fetchMock.calls;
    assert.equal(call?.hostname, "apigw.solides.com.br");
    assert.equal(call?.pathname, "/jobs/v3/home/vacancy");
    assert.equal(call?.searchParams.get("slug"), "grupoelevato");
    assert.equal(call?.searchParams.get("page"), "1");
  } finally {
    fetchMock.restore();
  }
});

test("SolidesAdapter walks every page until totalPages", async () => {
  const fetchMock = createFetchMock([
    page([{ ...ELEVATO_VACANCY, id: 1 }], { count: 2, totalPages: 2 }),
    page([{ ...ELEVATO_VACANCY, id: 2 }], {
      count: 2,
      currentPage: 2,
      totalPages: 2,
    }),
  ]);

  try {
    const adapter = new SolidesAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://grupoelevato.vagas.solides.com.br"),
    );

    assert.deepEqual(
      observations.map((observation) => observation.externalJobId),
      ["1", "2"],
    );
    assert.equal(fetchMock.calls.length, 2);
    assert.equal(fetchMock.calls[1]?.searchParams.get("page"), "2");
  } finally {
    fetchMock.restore();
  }
});

test("SolidesAdapter treats an empty envelope on page 1 as a missing board", async () => {
  const fetchMock = createFetchMock([
    { json: { success: true, errors: [], data: {} } },
  ]);

  try {
    const adapter = new SolidesAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () =>
        adapter.collect(
          createJobSourceContext("https://naoexiste.vagas.solides.com.br"),
        ),
      /Solides board not found/,
    );
  } finally {
    fetchMock.restore();
  }
});

test("SolidesAdapter returns no observations for an existing board without vacancies", async () => {
  const fetchMock = createFetchMock([page([], { count: 0, totalPages: 0 })]);

  try {
    const adapter = new SolidesAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://grupoelevato.vagas.solides.com.br"),
    );

    assert.equal(observations.length, 0);
    assert.equal(fetchMock.calls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("SolidesAdapter skips hidden vacancies and saves discarded titles", async () => {
  const fetchMock = createFetchMock([
    page([
      { ...ELEVATO_VACANCY, id: 1, isHiddenJob: true },
      { ...ELEVATO_VACANCY, id: 2, title: "Auxiliar de Limpeza" },
    ]),
  ]);
  const { semanticFilter } = createSemanticFilterMock({
    configVersion: "v1",
    reason: "noise_signal:mock",
    result: "SKIP",
  });
  const { database, upsertCalls } = createDatabaseMock();

  try {
    const adapter = new SolidesAdapter(semanticFilter, database);
    let skips = 0;
    const observations = await adapter.collect(
      createJobSourceContext("https://grupoelevato.vagas.solides.com.br"),
      {
        getExistingJobByCanonicalKey: async () => null,
        onSemanticFilterSkip: () => {
          skips += 1;
        },
      },
    );

    assert.equal(observations.length, 0);
    assert.equal(skips, 1);
    assert.equal(upsertCalls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("SolidesAdapter skips the semantic filter for already known jobs", async () => {
  const fetchMock = createFetchMock([page([ELEVATO_VACANCY])]);
  const { evaluatedTitles, semanticFilter } = createSemanticFilterMock({
    configVersion: "v1",
    reason: "noise_signal:mock",
    result: "SKIP",
  });

  try {
    const adapter = new SolidesAdapter(
      semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://grupoelevato.vagas.solides.com.br"),
      {
        getExistingJobByCanonicalKey: async () => ({ lastSeenAt: new Date() }),
      },
    );

    assert.equal(observations.length, 1);
    assert.equal(evaluatedTitles.length, 0);
  } finally {
    fetchMock.restore();
  }
});

test("SolidesAdapter maps remote jobs without address", async () => {
  const fetchMock = createFetchMock([
    page([
      {
        id: 7,
        title: "Desenvolvedor Backend",
        description: "",
        jobType: "remoto",
        city: null,
        state: null,
        address: null,
        recruitmentContractType: [{ name: "PJ" }],
      },
    ]),
  ]);

  try {
    const adapter = new SolidesAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const [observation] = await adapter.collect(
      createJobSourceContext("https://tech.vagas.solides.com.br"),
    );

    assert.equal(observation?.workModel, "remote");
    assert.equal(observation?.country, undefined);
    assert.equal(observation?.locationText, "Remote");
    assert.equal(observation?.employmentType, "pj");
    assert.equal(observation?.descriptionClean, "Desenvolvedor Backend");
  } finally {
    fetchMock.restore();
  }
});

test("SolidesAdapter throws typed error when the API responds 403", async () => {
  const fetchMock = createFetchMock([{ status: 403, json: {} }]);

  try {
    const adapter = new SolidesAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () =>
        adapter.collect(
          createJobSourceContext("https://grupoelevato.vagas.solides.com.br"),
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

test("SolidesAdapter retries once on 429 and succeeds", async () => {
  const fetchMock = createFetchMock([
    { status: 429, json: {} },
    page([ELEVATO_VACANCY]),
  ]);

  try {
    const adapter = new SolidesAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://grupoelevato.vagas.solides.com.br"),
    );

    assert.equal(observations.length, 1);
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("SolidesAdapter throws an actionable error for an invalid sourceUrl", async () => {
  const adapter = new SolidesAdapter(
    createSemanticFilterMock().semanticFilter,
    createDatabaseMock().database,
  );

  await assert.rejects(
    () =>
      adapter.collect(createJobSourceContext("https://careers.example.com")),
    /Invalid Solides sourceUrl/,
  );
});
