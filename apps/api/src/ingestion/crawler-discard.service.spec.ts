import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { Test } from "@nestjs/testing";

import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { CrawlerDiscardService } from "./crawler-discard.service";
import { IngestionModule } from "./ingestion.module";

async function createModule() {
  return Test.createTestingModule({
    imports: [DatabaseModule, IngestionModule],
  }).compile();
}

async function seedJobSource(
  database: DatabaseService,
  overrides: { sourceName?: string } = {},
) {
  const company = await database.company.create({
    data: {
      name: `Crawler Discard Co ${randomUUID()}`,
      normalizedName: `crawler-discard-co-${randomUUID()}`,
    },
  });

  return database.jobSource.create({
    data: {
      checkIntervalMinutes: 30,
      companyId: company.id,
      crawlStrategy: "html",
      parserKey: "gupy",
      sourceName: overrides.sourceName ?? "Source A",
      sourceType: "gupy",
      sourceUrl: `https://${randomUUID()}.gupy.io`,
    },
  });
}

async function seedDiscard(
  database: DatabaseService,
  jobSourceId: string,
  overrides: {
    canonicalKey?: string;
    filterReason?: string;
    title?: string;
  } = {},
) {
  return database.crawlerDiscardedTitle.create({
    data: {
      canonicalKey: overrides.canonicalKey ?? `gupy:x:${randomUUID()}`,
      externalJobId: randomUUID(),
      filterReason: overrides.filterReason ?? "noise_signal:enfermeiro",
      filterVersion: "v1",
      jobSourceId,
      normalizedTitle: "enfermeiro plantonista",
      title: overrides.title ?? "Enfermeiro Plantonista",
    },
  });
}

test("CrawlerDiscardService.list paginates and filters by filterReason", async () => {
  const moduleRef = await createModule();
  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(CrawlerDiscardService);

  const jobSource = await seedJobSource(database);
  await seedDiscard(database, jobSource.id, {
    filterReason: "noise_signal:enfermeiro",
    title: "Enfermeiro Plantonista",
  });
  await seedDiscard(database, jobSource.id, {
    filterReason: "zona_cinza",
    title: "Coordenador de Eventos",
  });

  const noiseOnly = await service.list({
    filterReason: "noise_signal",
    sourceId: jobSource.id,
  });
  assert.equal(noiseOnly.total, 1);
  assert.equal(noiseOnly.rows[0]?.title, "Enfermeiro Plantonista");

  const zonaOnly = await service.list({
    filterReason: "zona_cinza",
    sourceId: jobSource.id,
  });
  assert.equal(zonaOnly.total, 1);
  assert.equal(zonaOnly.rows[0]?.title, "Coordenador de Eventos");

  const paged = await service.list({
    page: 1,
    pageSize: 1,
    sourceId: jobSource.id,
  });
  assert.equal(paged.rows.length, 1);
  assert.equal(paged.totalPages, 2);
});

test("CrawlerDiscardService.list filters by sourceId and search", async () => {
  const moduleRef = await createModule();
  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(CrawlerDiscardService);

  const jobSourceA = await seedJobSource(database, { sourceName: "A" });
  const jobSourceB = await seedJobSource(database, { sourceName: "B" });
  await seedDiscard(database, jobSourceA.id, { title: "Enfermeiro Chefe" });
  await seedDiscard(database, jobSourceB.id, { title: "Vendedor Externo" });

  const bySource = await service.list({ sourceId: jobSourceA.id });
  assert.equal(bySource.total, 1);
  assert.equal(bySource.rows[0]?.sourceName, "A");

  const bySearch = await service.list({
    search: "vendedor",
    sourceId: jobSourceB.id,
  });
  assert.equal(bySearch.total, 1);
  assert.equal(bySearch.rows[0]?.title, "Vendedor Externo");
});

test("CrawlerDiscardService.whitelist adds term to techSignals and marks whitelistedAt", async () => {
  const moduleRef = await createModule();
  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(CrawlerDiscardService);

  const jobSource = await seedJobSource(database);
  const discard = await seedDiscard(database, jobSource.id, {
    title: "Analista de Governanca de TI Sr",
  });

  const newVersion = await service.whitelist(discard.id, "governanca de ti");

  assert.equal(newVersion.techSignals.includes("governanca de ti"), true);
  assert.equal(newVersion.isActive, true);

  const reloaded = await database.crawlerDiscardedTitle.findUniqueOrThrow({
    where: { id: discard.id },
  });
  assert.notEqual(reloaded.whitelistedAt, null);
});
