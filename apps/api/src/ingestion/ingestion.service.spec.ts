import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { CompaniesModule } from "../companies/companies.module";
import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { JobSourcesModule } from "../job-sources/job-sources.module";
import { IngestionModule } from "./ingestion.module";
import { IngestionService } from "./ingestion.service";

test("IngestionService creates audited jobs for a manual custom_html source", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      CompaniesModule,
      JobSourcesModule,
      IngestionModule,
    ],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(IngestionService);
  const company = await database.company.create({
    data: {
      name: "Manual Ingestion Co",
      normalizedName: `manual-ingestion-co-${randomUUID()}`,
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      checkIntervalMinutes: 30,
      companyId: company.id,
      crawlStrategy: "html",
      parserKey: "custom_html",
      sourceName: "Manual HTML Source",
      sourceType: "custom_html",
      sourceUrl: `https://manual.example.com/${randomUUID()}`,
    },
  });

  const result = await service.runJobSource(jobSource.id);

  assert.equal(result.status, "completed");
  assert.equal(result.newCount, 2);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.failedCount, 0);
  assert.equal(result.previewItems.length, 2);

  const jobs = await database.job.findMany({
    where: { jobSourceId: jobSource.id },
    orderBy: { canonicalKey: "asc" },
  });

  assert.equal(jobs.length, 2);
  assert.equal(
    jobs.every((job) => job.companyId === company.id),
    true,
  );

  await database.job.deleteMany({ where: { jobSourceId: jobSource.id } });
  await database.jobSource.delete({ where: { id: jobSource.id } });
  await database.company.delete({ where: { id: company.id } });
  await moduleRef.close();
});

test("IngestionService preserves firstSeenAt and updates existing jobs on rerun", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      CompaniesModule,
      JobSourcesModule,
      IngestionModule,
    ],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(IngestionService);
  const company = await database.company.create({
    data: {
      name: "Rerun Co",
      normalizedName: `rerun-co-${randomUUID()}`,
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      checkIntervalMinutes: 45,
      companyId: company.id,
      crawlStrategy: "api",
      parserKey: "custom_api",
      sourceName: "Manual API Source",
      sourceType: "custom_api",
      sourceUrl: `https://api.example.com/${randomUUID()}`,
    },
  });

  const firstRun = await service.runJobSource(jobSource.id);
  const firstJob = await database.job.findFirstOrThrow({
    where: { jobSourceId: jobSource.id },
  });
  const originalFirstSeenAt = firstJob.firstSeenAt.toISOString();

  const secondRun = await service.runJobSource(jobSource.id);
  const updatedJob = await database.job.findFirstOrThrow({
    where: { jobSourceId: jobSource.id },
  });

  assert.equal(firstRun.newCount, 1);
  assert.equal(secondRun.newCount, 0);
  assert.equal(secondRun.updatedCount, 1);
  assert.equal(updatedJob.firstSeenAt.toISOString(), originalFirstSeenAt);
  assert.equal(updatedJob.lastSeenAt >= firstJob.lastSeenAt, true);

  await database.job.deleteMany({ where: { jobSourceId: jobSource.id } });
  await database.jobSource.delete({ where: { id: jobSource.id } });
  await database.company.delete({ where: { id: company.id } });
  await moduleRef.close();
});

test("IngestionService blocks starting a second run while one is running", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule,
      CompaniesModule,
      JobSourcesModule,
      IngestionModule,
    ],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(IngestionService);
  const company = await database.company.create({
    data: {
      name: "Concurrent Run Co",
      normalizedName: `concurrent-run-co-${randomUUID()}`,
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      checkIntervalMinutes: 30,
      companyId: company.id,
      crawlStrategy: "api",
      parserKey: "custom_api",
      sourceName: "Concurrent API Source",
      sourceType: "custom_api",
      sourceUrl: `https://api.example.com/${randomUUID()}`,
    },
  });

  await database.ingestionRun.create({
    data: {
      jobSourceId: jobSource.id,
      status: "running",
    },
  });

  await assert.rejects(() => service.runJobSource(jobSource.id), (error) => {
    assert.equal(error instanceof ConflictException, true);
    assert.equal(
      (error as ConflictException).message,
      "ingestion run already in progress for this source",
    );
    return true;
  });

  await database.ingestionRun.deleteMany({ where: { jobSourceId: jobSource.id } });
  await database.jobSource.delete({ where: { id: jobSource.id } });
  await database.company.delete({ where: { id: company.id } });
  await moduleRef.close();
});
