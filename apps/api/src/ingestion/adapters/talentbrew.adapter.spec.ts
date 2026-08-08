import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../../database/database.service";
import { IngestionFetchError } from "../errors";
import type {
  SemanticFilterDecision,
  SemanticFilterService,
} from "../semantic-filter.service";
import type { JobSourceContext } from "../types";
import { TalentbrewAdapter } from "./talentbrew.adapter";

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
    parserKey: "talentbrew",
    sourceName: "TalentBrew Source",
    sourceType: "talentbrew",
    sourceUrl,
  };
}

function listingPage(cards: Array<{ href: string; jobId: string; title: string; location: string }>) {
  const items = cards
    .map(
      (c) => `
        <a href="${c.href}" data-job-id="${c.jobId}" class="results__item-link">
            <h2 class="results__item-heading">${c.title}</h2>
                <span class="job-location results__item-facet">${c.location}</span>
            <span class="fo-link-results results__item-facet">ver mais detalhes</span>
        </a>`,
    )
    .join("\n");
  return `<html><body><ul>${items}</ul></body></html>`;
}

function detailPage(jsonLd: Record<string, unknown>) {
  return `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
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

test("TalentbrewAdapter paginates listing pages, stops when a page has no cards, then fetches JSON-LD detail", async () => {
  const fetchMock = createFetchMock([
    {
      text: listingPage([
        {
          href: "/vaga/sao-paulo/analista/35299/98062537584",
          jobId: "98062537584",
          title: "Analista Pleno Valida&#xE7;&#xE3;o de Risco",
          location: "S&#xE3;o Paulo, S&#xE3;o Paulo",
        },
      ]),
    },
    { text: listingPage([]) },
    {
      text: detailPage({
        title: "Analista Pleno Validação de Risco",
        description: "<p>Descricao completa</p>",
        datePosted: "2026-7-20",
        employmentType: "vacancy_type_effective",
        industry: "Riscos",
        url: "https://carreiras.itau.com.br/vaga/sao-paulo/analista/35299/98062537584",
        jobLocation: [
          {
            address: {
              addressLocality: "São Paulo",
              addressRegion: "São Paulo",
              addressCountry: "Brasil",
            },
          },
        ],
      }),
    },
  ]);

  try {
    const adapter = new TalentbrewAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://carreiras.itau.com.br"),
    );

    assert.equal(observations.length, 1);
    assert.equal(
      observations[0]?.canonicalKey,
      "talentbrew:carreiras.itau.com.br:98062537584",
    );
    assert.equal(observations[0]?.title, "Analista Pleno Validação de Risco");
    assert.equal(observations[0]?.city, "São Paulo");
    assert.equal(observations[0]?.state, "São Paulo");
    assert.equal(observations[0]?.country, "Brasil");
    assert.equal(observations[0]?.department, "Riscos");
    assert.equal(observations[0]?.employmentType, "full_time");
    assert.equal(observations[0]?.employmentTypeRaw, "vacancy_type_effective");
    assert.equal(
      observations[0]?.descriptionClean.includes("Descricao completa"),
      true,
    );
    assert.equal(
      observations[0]?.sourceJobUrl,
      "https://carreiras.itau.com.br/vaga/sao-paulo/analista/35299/98062537584",
    );
    // 2 paginas de listagem (a segunda vazia encerra o loop) + 1 detalhe
    assert.equal(fetchMock.calls.length, 3);
    assert.equal(fetchMock.calls[0]?.searchParams.get("p"), "1");
    assert.equal(fetchMock.calls[1]?.searchParams.get("p"), "2");
  } finally {
    fetchMock.restore();
  }
});

test("TalentbrewAdapter saves CrawlerDiscardedTitle for noise_signal jobs without a detail-fetch", async () => {
  const fetchMock = createFetchMock([
    {
      text: listingPage([
        {
          href: "/vaga/x/enfermeiro/1/1",
          jobId: "1",
          title: "Enfermeiro Plantonista",
          location: "Sao Paulo",
        },
      ]),
    },
    { text: listingPage([]) },
  ]);

  try {
    const { evaluatedTitles, semanticFilter } = createSemanticFilterMock({
      configVersion: "v1",
      reason: "noise_signal:enfermeiro",
      result: "SKIP",
    });
    const { database, upsertCalls } = createDatabaseMock();
    const adapter = new TalentbrewAdapter(semanticFilter, database);

    const observations = await adapter.collect(
      createJobSourceContext("https://carreiras.itau.com.br"),
      { getExistingJobByCanonicalKey: async () => null, ingestionRunId: "run-1" },
    );

    assert.equal(observations.length, 0);
    assert.deepEqual(evaluatedTitles, ["enfermeiro plantonista"]);
    assert.equal(upsertCalls.length, 1);
    // 2 paginas de listagem, sem chamada de detalhe
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("TalentbrewAdapter skips detail fetch for a fresh existing job", async () => {
  const fetchMock = createFetchMock([
    {
      text: listingPage([
        {
          href: "/vaga/x/analista/1/1",
          jobId: "1",
          title: "Analista de Dados",
          location: "Sao Paulo",
        },
      ]),
    },
    { text: listingPage([]) },
  ]);

  try {
    const adapter = new TalentbrewAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://carreiras.itau.com.br"),
      {
        getExistingJobByCanonicalKey: async () => ({
          lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
        }),
      },
    );

    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.detailFetchSkipped, true);
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("TalentbrewAdapter throws typed error when the listing responds 403", async () => {
  const fetchMock = createFetchMock([{ status: 403, text: "" }]);

  try {
    const adapter = new TalentbrewAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );

    await assert.rejects(
      () => adapter.collect(createJobSourceContext("https://carreiras.itau.com.br")),
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

test("TalentbrewAdapter retries once on 429 and succeeds", async () => {
  const fetchMock = createFetchMock([
    { status: 429, text: "" },
    { text: listingPage([]) },
  ]);

  try {
    const adapter = new TalentbrewAdapter(
      createSemanticFilterMock().semanticFilter,
      createDatabaseMock().database,
    );
    const observations = await adapter.collect(
      createJobSourceContext("https://carreiras.itau.com.br"),
    );

    assert.deepEqual(observations, []);
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("TalentbrewAdapter throws an actionable error for an invalid sourceUrl", async () => {
  const adapter = new TalentbrewAdapter(
    createSemanticFilterMock().semanticFilter,
    createDatabaseMock().database,
  );

  await assert.rejects(
    () => adapter.collect(createJobSourceContext("not-a-url")),
    /Invalid TalentBrew sourceUrl/,
  );
});
