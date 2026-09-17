import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../../database/database.service";
import { IngestionFetchError } from "../errors";
import type {
  SemanticFilterDecision,
  SemanticFilterService,
} from "../semantic-filter.service";
import type { JobSourceContext } from "../types";
import { EightfoldAdapter } from "./eightfold.adapter";

type MockResponse = {
  status?: number;
  json?: unknown;
  text?: string;
  setCookie?: string[];
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
    parserKey: "eightfold",
    sourceName: "Eightfold Source",
    sourceType: "eightfold",
    sourceUrl,
  };
}

function createFetchMock(sequence: MockResponse[]) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: URL; headers?: Record<string, string> }> = [];
  let index = 0;

  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const callUrl = new URL(
      typeof input === "string" ? input : input.toString(),
    );
    calls.push({
      url: callUrl,
      headers: init?.headers as Record<string, string>,
    });

    const entry = sequence[index] ?? sequence[sequence.length - 1];
    index += 1;
    const status = entry?.status ?? 200;

    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      json: async () => entry?.json ?? {},
      text: async () => entry?.text ?? "",
      headers: {
        getSetCookie: () => entry?.setCookie ?? [],
      },
    } as unknown as Response;
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

const VALE_BOOTSTRAP_HTML = `<html><head>
<meta name="_csrf" content="csrf-token-abc">
<script>window._EF_GROUP_ID = "vale.com";</script>
</head><body></body></html>`;

test("EightfoldAdapter (modo proxy) pagina /api/positions e busca detalhe por vaga", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        positions: [
          {
            id: 43789203,
            name: "Especialista de Projetos",
            department: "People",
            locations: ["Sudeste,Brazil"],
            postedTs: 1786743249,
            positionUrl: "/careers/job/43789203",
          },
        ],
        count: 1,
        hasMore: false,
      },
    },
    {
      json: {
        error: false,
        title: "Especialista de Projetos",
        description: "<p>Descricao da vaga</p>",
      },
    },
  ]);

  try {
    const adapter = new EightfoldAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://careers-meli.mercadolibre.com/pt/positions",
      ),
    );

    assert.equal(observations.length, 1);
    assert.equal(
      observations[0]?.canonicalKey,
      "eightfold:careers-meli-mercadolibre-com:43789203",
    );
    assert.equal(observations[0]?.title, "Especialista de Projetos");
    assert.equal(observations[0]?.country, "Brasil");
    assert.equal(observations[0]?.locationText, "Regiao Sudeste, Brasil");
    assert.equal(observations[0]?.city, undefined);
    assert.equal(observations[0]?.department, "People");
    assert.equal(
      observations[0]?.descriptionClean.includes("Descricao da vaga"),
      true,
    );
    assert.equal(
      observations[0]?.sourceJobUrl,
      "https://careers-meli.mercadolibre.com/careers/job/43789203",
    );

    assert.equal(fetchMock.calls.length, 2);
    assert.equal(fetchMock.calls[0]?.url.pathname, "/api/positions");
    assert.equal(fetchMock.calls[1]?.url.pathname, "/api/position-detail");
    assert.equal(fetchMock.calls[1]?.url.searchParams.get("id"), "43789203");
  } finally {
    fetchMock.restore();
  }
});

test("EightfoldAdapter (modo proxy) pagina quando hasMore=true", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        positions: [{ id: 1, name: "Vaga 1" }],
        count: 2,
        hasMore: true,
      },
    },
    {
      json: {
        positions: [{ id: 2, name: "Vaga 2" }],
        count: 2,
        hasMore: false,
      },
    },
    { json: { error: false, title: "Vaga 1", description: "<p>d1</p>" } },
    { json: { error: false, title: "Vaga 2", description: "<p>d2</p>" } },
  ]);

  try {
    const adapter = new EightfoldAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext(
        "https://careers-meli.mercadolibre.com/pt/positions",
      ),
    );

    assert.equal(observations.length, 2);
    const listingCalls = fetchMock.calls.filter(
      (call) => call.url.pathname === "/api/positions",
    );
    assert.equal(listingCalls.length, 2);
    assert.equal(listingCalls[0]?.url.searchParams.get("start"), "0");
    assert.equal(listingCalls[1]?.url.searchParams.get("start"), "1");
  } finally {
    fetchMock.restore();
  }
});

test("EightfoldAdapter (modo proxy) salva CrawlerDiscardedTitle pra vaga filtrada e nao busca detalhe", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        positions: [{ id: 5, name: "Auxiliar de Limpeza" }],
        count: 1,
        hasMore: false,
      },
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock({
      configVersion: "v1",
      reason: "noise_signal:limpeza",
      result: "SKIP",
    });
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new EightfoldAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext(
        "https://careers-meli.mercadolibre.com/pt/positions",
      ),
      {
        getExistingJobByCanonicalKey: async () => null,
        ingestionRunId: "run-1",
      },
    );

    assert.equal(observations.length, 0);
    assert.deepEqual(evaluatedTitles, ["auxiliar de limpeza"]);
    assert.equal(upsertCalls.length, 1);
    assert.equal(fetchMock.calls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("EightfoldAdapter (modo proxy) pula filtro semantico pra vaga ja conhecida (dedup)", async () => {
  const fetchMock = createFetchMock([
    {
      json: {
        positions: [{ id: 6, name: "Vaga Conhecida" }],
        count: 1,
        hasMore: false,
      },
    },
    {
      json: {
        error: false,
        title: "Vaga Conhecida",
        description: "<p>full</p>",
      },
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock();
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new EightfoldAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext(
        "https://careers-meli.mercadolibre.com/pt/positions",
      ),
      {
        getExistingJobByCanonicalKey: async () => ({ lastSeenAt: new Date() }),
      },
    );

    assert.equal(observations.length, 1);
    assert.equal(evaluatedTitles.length, 0);
    assert.equal(upsertCalls.length, 0);
  } finally {
    fetchMock.restore();
  }
});

test("EightfoldAdapter (modo direto) faz bootstrap de sessao e envia cookie+csrf pro fetch de vagas", async () => {
  const fetchMock = createFetchMock([
    {
      text: VALE_BOOTSTRAP_HTML,
      setCookie: ["_vs=abc123; Path=/; HttpOnly", "_vscid=xyz; Path=/"],
    },
    {
      json: {
        positions: [
          {
            id: 44202146,
            name: "Especialista Suprimentos",
            department: "Corporativa",
            locations: ["Brazil", "Rio de Janeiro, Rio de Janeiro, Brasil"],
            t_create: 1787852351,
            job_description: "<p>Descricao completa</p>",
          },
        ],
        count: 1,
      },
    },
  ]);

  try {
    const adapter = new EightfoldAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://vale.eightfold.ai/careers"),
    );

    assert.equal(observations.length, 1);
    assert.equal(
      observations[0]?.canonicalKey,
      "eightfold:vale-eightfold-ai:44202146",
    );
    assert.equal(observations[0]?.city, "Rio de Janeiro");
    assert.equal(observations[0]?.state, "RJ");
    assert.equal(observations[0]?.country, "Brasil");
    assert.equal(
      observations[0]?.descriptionClean.includes("Descricao completa"),
      true,
    );

    assert.equal(fetchMock.calls.length, 2);
    assert.equal(fetchMock.calls[0]?.url.pathname, "/careers");
    const jobsCall = fetchMock.calls[1];
    assert.equal(jobsCall?.url.pathname, "/api/apply/v2/jobs");
    assert.equal(jobsCall?.url.searchParams.get("domain"), "vale.com");
    const headers = jobsCall?.headers as Record<string, string>;
    assert.equal(headers["x-csrf-token"], "csrf-token-abc");
    assert.equal(headers.Cookie.includes("_vs=abc123"), true);
  } finally {
    fetchMock.restore();
  }
});

test("EightfoldAdapter (modo direto) converte 403 'Not authorized for PCSX' em IngestionFetchError", async () => {
  const fetchMock = createFetchMock([
    {
      text: VALE_BOOTSTRAP_HTML,
      setCookie: ["_vs=abc123; Path=/"],
    },
    { status: 403, json: { message: "Not authorized for PCSX" } },
  ]);

  try {
    const adapter = new EightfoldAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () =>
        adapter.collect(
          createJobSourceContext("https://eaton.eightfold.ai/careers"),
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

test("EightfoldAdapter (modo direto) lanca IngestionFetchError quando bootstrap nao retorna cookie/csrf", async () => {
  const fetchMock = createFetchMock([
    { text: "<html><body>no meta here</body></html>" },
  ]);

  try {
    const adapter = new EightfoldAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () =>
        adapter.collect(
          createJobSourceContext("https://eaton.eightfold.ai/careers"),
        ),
      (error) => {
        assert.equal(error instanceof IngestionFetchError, true);
        return true;
      },
    );
  } finally {
    fetchMock.restore();
  }
});
