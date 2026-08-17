import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../../database/database.service";
import { IngestionFetchError } from "../errors";
import type {
  SemanticFilterDecision,
  SemanticFilterService,
} from "../semantic-filter.service";
import type { JobSourceContext } from "../types";
import { PandapeAdapter } from "./pandape.adapter";

type MockResponse = {
  status?: number;
  text?: string;
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
    parserKey: "pandape",
    sourceName: "Pandape Source",
    sourceType: "pandape",
    sourceUrl,
  };
}

// Markup real capturado de um board Pandape ao vivo (tendaatacado.pandape.
// infojobs.com.br) — os cards nao mudam de estrutura entre empresas, so o
// conteudo (ver investigacao antes de implementar o adapter).
function listingPage(
  cards: Array<{ jobId: string; title: string; location: string }>,
) {
  const items = cards
    .map(
      (c) => `
        <a target="_blank" class="card card-vacancy mb-20" href="/Detail/${c.jobId}">
            <div class="card-body p-20">
                <div class="d-flex align-items-center mb-10">
                    <h3 class="link font-xl mb-0 fw-600" title="${c.title}">${c.title}</h3>
                </div>
                <div class="vacancy-detail">
                    <div class="d-flex text-medium flex-wrap">
                        <div class="align-middle mr-20 mb-10">
                            <div class="icon-container d-inline-block lh-100 align-middle   " style="">
    <i class="icon icon-location-pin-1"></i>
</div>
                            ${c.location}
                        </div>
                    </div>
                    <div class="vacancy-date font-sm tetx-medium">14 ago</div>
                </div>
            </div>
        </a>`,
    )
    .join("\n");
  return `<html><body>${items}</body></html>`;
}

function detailPage(jsonLd: Record<string, unknown>) {
  return `<html><head><script type="application/ld+json" >${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
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

test("PandapeAdapter paginates listing pages, stops when a page has fewer than PageSize cards, then fetches JSON-LD detail", async () => {
  const fetchMock = createFetchMock([
    {
      text: listingPage([
        {
          jobId: "3611348",
          title: "Analista de Risco e Compliance Pl.",
          location: "S&#xE3;o Paulo - SP",
        },
      ]),
    },
    {
      text: detailPage({
        "@context": "http://schema.org",
        "@type": "JobPosting",
        datePosted: "2026-08-14T15:23:49.5627555",
        description: "Fazer parte do Grupo Tenda Atacado...",
        employmentType: "full-time",
        hiringOrganization: { "@type": "Organization", name: "TENDA ATACADO" },
        jobLocation: {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressCountry: "BR",
            addressLocality: "São Paulo",
            addressRegion: "SP",
          },
        },
        title: "Analista de Risco e Compliance Pl.",
      }),
    },
  ]);

  try {
    const adapter = new PandapeAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://tendaatacado.pandape.com.br"),
    );

    assert.equal(observations.length, 1);
    assert.equal(
      observations[0]?.canonicalKey,
      "pandape:tendaatacado:3611348",
    );
    assert.equal(observations[0]?.title, "Analista de Risco e Compliance Pl.");
    assert.equal(observations[0]?.city, "São Paulo");
    assert.equal(observations[0]?.state, "SP");
    assert.equal(observations[0]?.country, "BR");
    assert.equal(observations[0]?.employmentType, "full_time");
    assert.equal(observations[0]?.employmentTypeRaw, "full-time");
    assert.equal(
      observations[0]?.sourceJobUrl,
      "https://tendaatacado.pandape.com.br/Detail/3611348",
    );
    // 1 pagina de listagem (< PageSize=20 encerra o loop) + 1 detalhe
    assert.equal(fetchMock.calls.length, 2);
    assert.equal(fetchMock.calls[0]?.searchParams.get("PageNumber"), "1");
    assert.equal(fetchMock.calls[0]?.searchParams.get("PageSize"), "20");
  } finally {
    fetchMock.restore();
  }
});

test("PandapeAdapter decodes HTML entities from the listing card (title/location)", async () => {
  const fetchMock = createFetchMock([
    {
      text: listingPage([
        {
          jobId: "1",
          title: "Fiscal de Preven&#xE7;&#xE3;o de Perdas",
          location: "S&#xE3;o Jos&#xE9; dos Campos - SP",
        },
      ]),
    },
    {
      text: detailPage({
        description: "desc",
        employmentType: "full-time",
        jobLocation: {
          address: {
            addressCountry: "BR",
            addressLocality: "São José dos Campos",
            addressRegion: "SP",
          },
        },
        title: "Fiscal de Prevenção de Perdas",
      }),
    },
  ]);

  try {
    const adapter = new PandapeAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://grupogr.pandape.com.br"),
    );

    assert.equal(observations[0]?.title, "Fiscal de Prevenção de Perdas");
    assert.equal(observations[0]?.city, "São José Dos Campos");
  } finally {
    fetchMock.restore();
  }
});

test("PandapeAdapter saves CrawlerDiscardedTitle for noise_signal jobs without a detail fetch", async () => {
  const fetchMock = createFetchMock([
    {
      text: listingPage([
        { jobId: "1", title: "Enfermeiro Plantonista", location: "Sao Paulo - SP" },
      ]),
    },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock({
      configVersion: "v1",
      reason: "noise_signal:enfermeiro",
      result: "SKIP",
    });
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new PandapeAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://tendaatacado.pandape.com.br"),
      { getExistingJobByCanonicalKey: async () => null, ingestionRunId: "run-1" },
    );

    assert.equal(observations.length, 0);
    assert.deepEqual(evaluatedTitles, ["enfermeiro plantonista"]);
    assert.equal(upsertCalls.length, 1);
    // 1 pagina de listagem, sem chamada de detalhe
    assert.equal(fetchMock.calls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("PandapeAdapter skips detail fetch for a fresh existing job", async () => {
  const fetchMock = createFetchMock([
    {
      text: listingPage([
        { jobId: "1", title: "Analista de Dados", location: "Sao Paulo - SP" },
      ]),
    },
  ]);

  try {
    const adapter = new PandapeAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://tendaatacado.pandape.com.br"),
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

test("PandapeAdapter throws typed error when the listing responds 403", async () => {
  const fetchMock = createFetchMock([{ status: 403, text: "" }]);

  try {
    const adapter = new PandapeAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () => adapter.collect(createJobSourceContext("https://tendaatacado.pandape.com.br")),
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

test("PandapeAdapter retries once on 429 and succeeds", async () => {
  const fetchMock = createFetchMock([
    { status: 429, text: "" },
    { text: listingPage([]) },
  ]);

  try {
    const adapter = new PandapeAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://tendaatacado.pandape.com.br"),
    );

    assert.deepEqual(observations, []);
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("PandapeAdapter throws an actionable error for an invalid sourceUrl", async () => {
  const adapter = new PandapeAdapter(
    createSemanticFilterMock().semanticFilter,
    createDatabaseMock().database,
  );

  await assert.rejects(
    () => adapter.collect(createJobSourceContext("not-a-url")),
    /Invalid Pandape sourceUrl/,
  );
});
