import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPublicJobSlug, toPublicJobView } from "./public-job-view";

test("buildPublicJobSlug creates stable slug with job id suffix", () => {
  assert.equal(
    buildPublicJobSlug("cmp_job123", "Pessoa Engenheira de Dados", "Itau"),
    "pessoa-engenheira-de-dados-itau-cmp-job123",
  );
});

test("toPublicJobView passes through the persisted slug instead of recomputing it", () => {
  const view = toPublicJobView({
    canonicalKey: "key-1",
    company: { name: "Itau", websiteUrl: null },
    country: "BR",
    descriptionClean: "desc",
    descriptionRaw: "<p>desc</p>",
    employmentType: null,
    firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
    id: "cmp_job123",
    lastSeenAt: new Date("2026-01-02T00:00:00.000Z"),
    locationText: "Sao Paulo",
    publishedAtSource: null,
    seniorityLevel: null,
    // título mudou depois da criação, mas o slug persistido não deve mudar
    slug: "titulo-antigo-itau-cmp-job123",
    sourceJobUrl: "https://example.com/vaga",
    status: "active",
    title: "Título Novo",
    workModel: null,
  });

  assert.equal(view.slug, "titulo-antigo-itau-cmp-job123");
});

test("toPublicJobView falls back to empty string when slug is null", () => {
  const view = toPublicJobView({
    canonicalKey: "key-2",
    company: { name: "Itau", websiteUrl: null },
    country: "BR",
    descriptionClean: "desc",
    descriptionRaw: "<p>desc</p>",
    employmentType: null,
    firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
    id: "cmp_job456",
    lastSeenAt: new Date("2026-01-02T00:00:00.000Z"),
    locationText: "Sao Paulo",
    publishedAtSource: null,
    seniorityLevel: null,
    slug: null,
    sourceJobUrl: "https://example.com/vaga",
    status: "active",
    title: "Título",
    workModel: null,
  });

  assert.equal(view.slug, "");
});
