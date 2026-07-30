import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { Test } from "@nestjs/testing";

import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { IngestionModule } from "./ingestion.module";
import { SemanticFilterAdminService } from "./semantic-filter-admin.service";

async function createModule() {
  return Test.createTestingModule({
    imports: [DatabaseModule, IngestionModule],
  }).compile();
}

async function seedJobWithEnrichment(
  database: DatabaseService,
  overrides: {
    enrichmentStatus?: "PENDING" | "SKIPPED" | "COMPLETED" | "FAILED";
    firstSeenAt?: Date;
    normalizedTitle?: string;
    semanticFilterReason?: string | null;
    sourceName?: string;
  } = {},
) {
  const company = await database.company.create({
    data: {
      name: `Semantic Filter Co ${randomUUID()}`,
      normalizedName: `semantic-filter-co-${randomUUID()}`,
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      checkIntervalMinutes: 30,
      companyId: company.id,
      crawlStrategy: "html",
      parserKey: "custom_html",
      sourceName: overrides.sourceName ?? "Source A",
      sourceType: "custom_html",
      sourceUrl: `https://example.com/${randomUUID()}`,
    },
  });
  const now = new Date();
  const job = await database.job.create({
    data: {
      canonicalKey: `semantic-filter:${randomUUID()}`,
      companyId: company.id,
      descriptionClean: "Descricao",
      descriptionRaw: "Descricao",
      firstSeenAt: overrides.firstSeenAt ?? now,
      jobSourceId: jobSource.id,
      lastSeenAt: now,
      locationText: "Remoto",
      normalizedTitle: overrides.normalizedTitle ?? "enfermeiro plantonista",
      sourceJobUrl: `https://example.com/${randomUUID()}`,
      title: "Enfermeiro Plantonista",
    },
  });
  const enrichment = await database.jobEnrichment.create({
    data: {
      enrichmentStatus: overrides.enrichmentStatus ?? "SKIPPED",
      jobId: job.id,
      semanticFilterReason:
        overrides.semanticFilterReason ?? "noise_signal:enfermeiro",
      semanticFilterResult: "SKIP",
    },
  });

  return { company, enrichment, job, jobSource };
}

test("SemanticFilterAdminService.createNewVersion deactivates current and increments version", async () => {
  const moduleRef = await createModule();
  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(SemanticFilterAdminService);

  const versionBefore = await service.getActiveConfig();

  const first = await service.createNewVersion({
    noiseSignals: ["enfermeiro"],
    techSignals: ["desenvolvedor"],
  });
  const second = await service.createNewVersion({
    description: "ajuste de sinais",
    noiseSignals: ["enfermeiro", "vendedor"],
    techSignals: ["desenvolvedor", "engenheiro"],
  });

  assert.notEqual(first.version, versionBefore?.version);
  assert.notEqual(second.version, first.version);
  assert.equal(second.isActive, true);

  const reloadedFirst = await database.semanticFilterConfig.findUniqueOrThrow({
    where: { id: first.id },
  });
  assert.equal(reloadedFirst.isActive, false);

  const active = await service.getActiveConfig();
  assert.equal(active?.id, second.id);

  await database.semanticFilterConfig.deleteMany({
    where: { id: { in: [first.id, second.id] } },
  });
  if (versionBefore) {
    await database.semanticFilterConfig.update({
      where: { id: versionBefore.id },
      data: { isActive: true },
    });
  }
  await moduleRef.close();
});

test("SemanticFilterAdminService.listSkipped filters by reasonKind and sourceName", async () => {
  const moduleRef = await createModule();
  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(SemanticFilterAdminService);

  const noise = await seedJobWithEnrichment(database, {
    semanticFilterReason: "noise_signal:enfermeiro",
    sourceName: "Fonte X",
  });
  const grayZone = await seedJobWithEnrichment(database, {
    normalizedTitle: "coordenador de operacoes",
    semanticFilterReason: "zona_cinza",
    sourceName: "Fonte Y",
  });

  const onlyGrayZone = await service.listSkipped({ reasonKind: "zona_cinza" });
  assert.equal(onlyGrayZone.total, 1);
  assert.equal(onlyGrayZone.rows[0]?.id, grayZone.enrichment.id);

  const onlyFonteX = await service.listSkipped({ sourceName: "Fonte X" });
  assert.equal(onlyFonteX.total, 1);
  assert.equal(onlyFonteX.rows[0]?.id, noise.enrichment.id);

  await database.job.deleteMany({
    where: { id: { in: [noise.job.id, grayZone.job.id] } },
  });
  await database.jobSource.deleteMany({
    where: { id: { in: [noise.jobSource.id, grayZone.jobSource.id] } },
  });
  await database.company.deleteMany({
    where: { id: { in: [noise.company.id, grayZone.company.id] } },
  });
  await moduleRef.close();
});

test("SemanticFilterAdminService.reenrich resets status and attempts", async () => {
  const moduleRef = await createModule();
  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(SemanticFilterAdminService);

  const seed = await seedJobWithEnrichment(database);
  await database.jobEnrichment.update({
    where: { id: seed.enrichment.id },
    data: { attempts: 2, enrichmentError: "boom" },
  });

  const result = await service.reenrich(seed.enrichment.id);

  assert.equal(result.enrichmentStatus, "PENDING");
  assert.equal(result.attempts, 0);
  assert.equal(result.enrichmentError, null);
  assert.equal(result.semanticFilterResult, "PENDING");

  await database.job.delete({ where: { id: seed.job.id } });
  await database.jobSource.delete({ where: { id: seed.jobSource.id } });
  await database.company.delete({ where: { id: seed.company.id } });
  await moduleRef.close();
});

test("SemanticFilterAdminService.getDashboard counts by status", async () => {
  const moduleRef = await createModule();
  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(SemanticFilterAdminService);

  const pending = await seedJobWithEnrichment(database, {
    enrichmentStatus: "PENDING",
  });
  const skipped = await seedJobWithEnrichment(database, {
    enrichmentStatus: "SKIPPED",
  });

  const dashboard = await service.getDashboard();

  assert.equal(dashboard.pending >= 1, true);
  assert.equal(dashboard.skipped24h >= 1, true);

  await database.job.deleteMany({
    where: { id: { in: [pending.job.id, skipped.job.id] } },
  });
  await database.jobSource.deleteMany({
    where: { id: { in: [pending.jobSource.id, skipped.jobSource.id] } },
  });
  await database.company.deleteMany({
    where: { id: { in: [pending.company.id, skipped.company.id] } },
  });
  await moduleRef.close();
});
