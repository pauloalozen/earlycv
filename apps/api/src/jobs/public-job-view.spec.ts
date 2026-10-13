import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPublicJobSlug,
  jobIdFromPublicSlug,
  toPublicJobView,
} from "./public-job-view";

test("buildPublicJobSlug creates stable slug with job id suffix", () => {
  assert.equal(
    buildPublicJobSlug("cmp_job123", "Pessoa Engenheira de Dados", "Itau"),
    "pessoa-engenheira-de-dados-itau-cmp-job123",
  );
});

test("toPublicJobView passes through the persisted slug instead of recomputing it", () => {
  const view = toPublicJobView({
    canonicalKey: "key-1",
    company: { name: "Itau", websiteUrl: null, logoUrl: null },
    country: "BR",
    descriptionClean: "desc",
    descriptionRaw: "<p>desc</p>",
    employmentType: null,
    enrichment: { technologies: ["python", "sql"] },
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
  assert.deepEqual(view.technologies, ["python", "sql"]);
});

test("toPublicJobView falls back to empty string when slug is null, and to [] when enrichment is null", () => {
  const view = toPublicJobView({
    canonicalKey: "key-2",
    company: { name: "Itau", websiteUrl: null, logoUrl: null },
    country: "BR",
    descriptionClean: "desc",
    descriptionRaw: "<p>desc</p>",
    employmentType: null,
    enrichment: null,
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
  assert.deepEqual(view.technologies, []);
});

test("jobIdFromPublicSlug devolve o cuid do fim do slug", () => {
  assert.equal(
    jobIdFromPublicSlug("dev-java-acme-cmg1abcdefghijklmnopqrstu"),
    "cmg1abcdefghijklmnopqrstu",
  );
  assert.equal(
    jobIdFromPublicSlug("dev-java-acme-cmg1abcdefghijklmnopqrstu_2"),
    "cmg1abcdefghijklmnopqrstu",
  );
  assert.equal(jobIdFromPublicSlug("dev-java-acme-123"), null);
  assert.equal(jobIdFromPublicSlug(""), null);
});

test("toPublicJobView expõe o nome de exibição da empresa sem mudar o nome cru", () => {
  const base = {
    canonicalKey: "key-3",
    country: "BR",
    descriptionClean: "desc",
    descriptionRaw: "<p>desc</p>",
    employmentType: null,
    enrichment: null,
    externalJobId: null,
    firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
    id: "cmp_job789",
    lastSeenAt: new Date("2026-01-02T00:00:00.000Z"),
    locationText: "Sao Paulo",
    publishedAtSource: null,
    seniorityLevel: null,
    slug: "dev-lets-rent-a-car-cmp-job789",
    sourceJobUrl: "https://example.com/vaga",
    state: null,
    city: null,
    status: "active",
    title: "Dev",
    workModel: null,
  };

  const computed = toPublicJobView({
    ...base,
    company: { name: "LET'S RENT A CAR S.A.", websiteUrl: null, logoUrl: null },
  });
  assert.equal(computed.company, "LET'S RENT A CAR S.A.");
  assert.equal(computed.companyDisplayName, "Let's Rent A Car");

  const edited = toPublicJobView({
    ...base,
    company: {
      displayName: "Let's Rent a Car",
      name: "LET'S RENT A CAR S.A.",
      websiteUrl: null,
      logoUrl: null,
    },
  });
  assert.equal(edited.companyDisplayName, "Let's Rent a Car");
});
