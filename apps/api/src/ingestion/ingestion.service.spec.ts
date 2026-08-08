import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { JobSourceType } from "@prisma/client";

import { CompaniesModule } from "../companies/companies.module";
import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { JobSourcesModule } from "../job-sources/job-sources.module";
import { IngestionFetchError } from "./errors";
import { IngestionModule } from "./ingestion.module";
import { IngestionService } from "./ingestion.service";
import type { IngestionCollectContext } from "./types";

function createIngestionServiceFixture(options?: {
  collectError?: Error;
  observations?: Array<{
    canonicalKey: string;
    lastSeenAt?: string;
    status?: "active" | "inactive" | "removed";
    title?: string;
  }>;
  sourceType?: JobSourceType;
}) {
  const updatedJobs = new Map<
    string,
    {
      id: string;
      canonicalKey: string;
      status: string;
      lastSeenAt: Date;
      slug?: string;
    }
  >();
  const createdJobs: Array<{
    canonicalKey: string;
    status: string;
    lastSeenAt: Date;
  }> = [];
  const rawJobUpdates: Array<{
    where: { id: string };
    data: Record<string, unknown>;
  }> = [];
  let staleUpdateManyCount = 0;
  let collectContext: IngestionCollectContext | undefined;

  const database = {
    ingestionRun: {
      create: async ({
        data,
      }: {
        data: { jobSourceId: string; status: string };
      }) => ({
        id: "run-1",
        jobSourceId: data.jobSourceId,
        status: data.status,
        startedAt: new Date("2026-06-01T12:00:00.000Z"),
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
      }),
      findFirst: async () => null,
      findMany: async () => [],
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "run-1",
        jobSourceId: "source-1",
        status: data.status ?? "completed",
        startedAt: new Date("2026-06-01T12:00:00.000Z"),
        finishedAt: new Date("2026-06-01T12:05:00.000Z"),
        newCount: data.newCount ?? 0,
        updatedCount: data.updatedCount ?? 0,
        skippedCount: data.skippedCount ?? 0,
        failedCount: data.failedCount ?? 0,
        errorSummary: data.errorSummary ?? null,
        previewJson: data.previewJson ?? [],
      }),
    },
    jobSource: {
      findUnique: async () => ({
        id: "source-1",
        companyId: "company-1",
        sourceType: (options?.sourceType ?? "custom_html") as JobSourceType,
        sourceName: "Source 1",
        sourceUrl: "https://jobs.example.com",
        parserKey: "custom_html",
        crawlStrategy: "html",
        consecutive403Count: 0,
        pausedUntil: null,
        pauseReason: null,
        checkIntervalMinutes: 30,
        company: {
          id: "company-1",
          name: "Company 1",
          normalizedName: "company-1",
        },
      }),
      update: async () => ({ ok: true }),
    },
    job: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdJobs.push({
          canonicalKey: String(data.canonicalKey),
          status: String(data.status ?? "active"),
          lastSeenAt: data.lastSeenAt as Date,
        });
        return { id: "created-job" };
      },
      findUnique: async ({ where }: { where: { canonicalKey: string } }) => {
        if (where.canonicalKey === "job-a") {
          return {
            id: "job-a-id",
            canonicalKey: "job-a",
            firstSeenAt: new Date("2026-05-01T10:00:00.000Z"),
            lastSeenAt: new Date("2026-05-20T10:00:00.000Z"),
          };
        }

        if (where.canonicalKey === "job-reappear") {
          return {
            id: "job-reappear-id",
            canonicalKey: "job-reappear",
            firstSeenAt: new Date("2026-05-01T10:00:00.000Z"),
            lastSeenAt: new Date("2026-05-10T10:00:00.000Z"),
            status: "inactive",
          };
        }

        return null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        rawJobUpdates.push({ where, data });
        updatedJobs.set(where.id, {
          id: where.id,
          canonicalKey: where.id.includes("reappear")
            ? "job-reappear"
            : "job-a",
          status: String(data.status ?? "active"),
          lastSeenAt: (data.lastSeenAt as Date) ?? new Date(),
          ...(typeof data.slug === "string" ? { slug: data.slug } : {}),
        });
        return { id: where.id };
      },
      updateMany: async ({ where }: { where: Record<string, unknown> }) => {
        const status = where.status;
        const lastSeenAt = where.lastSeenAt as { lt?: Date } | undefined;
        if (status === "active" && lastSeenAt?.lt) {
          return { count: staleUpdateManyCount };
        }
        return { count: 0 };
      },
    },
  };

  const adapter = {
    sourceType: "custom_html" as const,
    collect: async (_jobSource: unknown, context?: IngestionCollectContext) => {
      collectContext = context;
      if (options?.collectError) {
        throw options.collectError;
      }

      return (options?.observations ?? []).map((item) => ({
        canonicalKey: item.canonicalKey,
        city: "Sao Paulo",
        country: "Brasil",
        descriptionClean: "desc",
        descriptionRaw: "desc",
        firstSeenAt: "2026-06-01T10:00:00.000Z",
        lastSeenAt: item.lastSeenAt ?? "2026-06-01T10:00:00.000Z",
        locationText: "Sao Paulo, Brasil",
        normalizedTitle: "title",
        sourceJobUrl: `https://jobs.example.com/${item.canonicalKey}`,
        status: item.status ?? "active",
        title: item.title ?? item.canonicalKey,
      }));
    },
  };

  const service = new IngestionService(
    database as never,
    adapter as never,
    { sourceType: "custom_api", collect: async () => [] } as never,
    { sourceType: "gupy", collect: async () => [] } as never,
    { sourceType: "greenhouse", collect: async () => [] } as never,
    { sourceType: "lever", collect: async () => [] } as never,
    { sourceType: "ashby", collect: async () => [] } as never,
    { sourceType: "inhire", collect: async () => [] } as never,
    { sourceType: "teamtailor", collect: async () => [] } as never,
  );

  return {
    collectContext: () => collectContext,
    createdJobs,
    rawJobUpdates,
    service,
    setStaleCount(count: number) {
      staleUpdateManyCount = count;
    },
    updatedJobs,
  };
}

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

  const enrichments = await database.jobEnrichment.findMany({
    where: { jobId: { in: jobs.map((job) => job.id) } },
  });
  assert.equal(enrichments.length, 2);
  assert.equal(
    enrichments.every((entry) => entry.enrichmentStatus === "PENDING"),
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

  const enrichments = await database.jobEnrichment.findMany({
    where: { jobId: updatedJob.id },
  });
  assert.equal(
    enrichments.length,
    1,
    "rerun on an existing job must not create a second JobEnrichment row",
  );

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

  await assert.rejects(
    () => service.runJobSource(jobSource.id),
    (error) => {
      assert.equal(error instanceof ConflictException, true);
      assert.equal(
        (error as ConflictException).message,
        "ingestion run already in progress for this source",
      );
      return true;
    },
  );

  await database.ingestionRun.deleteMany({
    where: { jobSourceId: jobSource.id },
  });
  await database.jobSource.delete({ where: { id: jobSource.id } });
  await database.company.delete({ where: { id: company.id } });
  await moduleRef.close();
});

test("IngestionService recovers a stale running run and lets a new run start", async () => {
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
      name: "Stale Run Co",
      normalizedName: `stale-run-co-${randomUUID()}`,
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      checkIntervalMinutes: 30,
      companyId: company.id,
      crawlStrategy: "html",
      parserKey: "custom_html",
      sourceName: "Stale Run Source",
      sourceType: "custom_html",
      sourceUrl: `https://stale.example.com/${randomUUID()}`,
    },
  });

  const staleRun = await database.ingestionRun.create({
    data: {
      jobSourceId: jobSource.id,
      startedAt: new Date(Date.now() - 60 * 60_000),
      status: "running",
    },
  });

  const result = await service.runJobSource(jobSource.id);

  assert.equal(result.status, "completed");

  const recovered = await database.ingestionRun.findUnique({
    where: { id: staleRun.id },
  });
  assert.equal(recovered?.status, "failed");
  assert.ok(recovered?.finishedAt);
  assert.match(recovered?.errorSummary ?? "", /stale run/);

  await database.ingestionRun.deleteMany({
    where: { jobSourceId: jobSource.id },
  });
  await database.jobSource.delete({ where: { id: jobSource.id } });
  await database.company.delete({ where: { id: company.id } });
  await moduleRef.close();
});

test("IngestionService marks stale jobs inactive after fully successful run", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a" }],
  });
  fixture.setStaleCount(2);

  const result = await fixture.service.runJobSource("source-1");

  assert.equal(result.status, "completed");
  assert.equal(result.failedCount, 0);
  assert.equal(result.staleMarkedCount, 2);
});

test("IngestionService does not mark stale jobs on global run failure", async () => {
  const fixture = createIngestionServiceFixture({
    collectError: new Error("adapter failure"),
  });
  fixture.setStaleCount(3);

  const result = await fixture.service.runJobSource("source-1");

  assert.equal(result.status, "failed");
  assert.equal(result.failedCount, 1);
  assert.equal(result.staleMarkedCount, undefined);
});

test("IngestionService reactivates previously inactive job when it reappears", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-reappear" }],
  });

  await fixture.service.runJobSource("source-1");

  const updated = fixture.updatedJobs.get("job-reappear-id");
  assert.ok(updated);
  assert.equal(updated.status, "active");
});

test("IngestionService persists a computed slug when creating a new job", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-slug-new", title: "Vaga Nova" }],
  });

  await fixture.service.runJobSource("source-1");

  const updated = fixture.updatedJobs.get("created-job");
  assert.ok(updated);
  assert.equal(updated.slug, "vaga-nova-company-1-created-job");
});

test("IngestionService never touches slug when updating an existing job, even if the title changed at the source", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a", title: "Titulo Novo Da Fonte" }],
  });

  await fixture.service.runJobSource("source-1");

  const jobAUpdate = fixture.rawJobUpdates.find(
    (call) => call.where.id === "job-a-id",
  );
  assert.ok(jobAUpdate, "expected an update call for the existing job");
  assert.equal(
    Object.hasOwn(jobAUpdate.data, "slug"),
    false,
    "slug must never be part of the update payload for an existing job",
  );
});

test("IngestionService keeps staleMarkedCount zero when no old jobs are found", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a" }],
  });
  fixture.setStaleCount(0);

  const result = await fixture.service.runJobSource("source-1");

  assert.equal(result.status, "completed");
  assert.equal(result.staleMarkedCount, 0);
});

test("IngestionService rejects run when source is paused", async () => {
  const fixture = createIngestionServiceFixture();
  fixture.service.database.jobSource.findUnique = async () => ({
    checkIntervalMinutes: 30,
    company: {
      id: "company-1",
      name: "Company 1",
      normalizedName: "company-1",
    },
    companyId: "company-1",
    consecutive403Count: 2,
    crawlStrategy: "html",
    id: "source-1",
    parserKey: "custom_html",
    pauseReason: "gupy_403_circuit_breaker",
    pausedUntil: new Date(Date.now() + 60_000),
    sourceName: "Source 1",
    sourceType: "custom_html",
    sourceUrl: "https://jobs.example.com",
  });

  await assert.rejects(
    () => fixture.service.runJobSource("source-1"),
    (error) => {
      assert.equal(error instanceof ConflictException, true);
      return true;
    },
  );
});

test("IngestionService increments 403 counter on forbidden adapter failure", async () => {
  const fixture = createIngestionServiceFixture({
    collectError: new IngestionFetchError({
      context: "gupy_board_api",
      message: "forbidden",
      statusCode: 403,
    }),
  });
  let updatedJobSourceData: Record<string, unknown> | null = null;
  fixture.service.database.jobSource.update = async ({
    data,
  }: {
    data: Record<string, unknown>;
  }) => {
    updatedJobSourceData = data;
    return { ok: true };
  };

  const result = await fixture.service.runJobSource("source-1");

  assert.equal(result.status, "failed");
  assert.equal(result.currentConsecutive403, 1);
  assert.equal(updatedJobSourceData?.consecutive403Count, 1);
});

test("IngestionService provides collect context lookup for adapters", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a" }],
  });

  await fixture.service.runJobSource("source-1");

  const context = fixture.collectContext();
  assert.ok(context);
  const existing = await context?.getExistingJobByCanonicalKey("job-a");
  assert.ok(existing);
  assert.equal(existing?.lastSeenAt instanceof Date, true);
});

test("IngestionService reports detailFetchSkippedCount from observations", async () => {
  const fixture = createIngestionServiceFixture();
  fixture.service.adapters = new Map([
    [
      "custom_html",
      {
        sourceType: "custom_html",
        collect: async () => [
          {
            canonicalKey: "job-skip",
            descriptionClean: "desc",
            descriptionRaw: "desc",
            detailFetchSkipped: true,
            firstSeenAt: "2026-06-01T10:00:00.000Z",
            lastSeenAt: "2026-06-01T10:00:00.000Z",
            locationText: "Sao Paulo, Brasil",
            normalizedTitle: "job skip",
            sourceJobUrl: "https://jobs.example.com/job-skip",
            status: "active",
            title: "Job Skip",
          },
        ],
      },
    ],
  ]);

  const result = await fixture.service.runJobSource("source-1");
  assert.equal(result.detailFetchSkippedCount, 1);
});

test("IngestionService dispatches to the greenhouse adapter for greenhouse sources", async () => {
  const fixture = createIngestionServiceFixture({ sourceType: "greenhouse" });
  let collectCalls = 0;
  fixture.service.adapters = new Map([
    [
      "greenhouse",
      {
        sourceType: "greenhouse",
        collect: async () => {
          collectCalls += 1;
          return [];
        },
      },
    ],
  ]);

  await fixture.service.runJobSource("source-1");
  assert.equal(collectCalls, 1);
});

test("IngestionService dispatches to the lever adapter for lever sources", async () => {
  const fixture = createIngestionServiceFixture({ sourceType: "lever" });
  let collectCalls = 0;
  fixture.service.adapters = new Map([
    [
      "lever",
      {
        sourceType: "lever",
        collect: async () => {
          collectCalls += 1;
          return [];
        },
      },
    ],
  ]);

  await fixture.service.runJobSource("source-1");
  assert.equal(collectCalls, 1);
});

test("IngestionService dispatches to the ashby adapter for ashby sources", async () => {
  const fixture = createIngestionServiceFixture({ sourceType: "ashby" });
  let collectCalls = 0;
  fixture.service.adapters = new Map([
    [
      "ashby",
      {
        sourceType: "ashby",
        collect: async () => {
          collectCalls += 1;
          return [];
        },
      },
    ],
  ]);

  await fixture.service.runJobSource("source-1");
  assert.equal(collectCalls, 1);
});

test("IngestionService dispatches to the inhire adapter for inhire sources", async () => {
  const fixture = createIngestionServiceFixture({ sourceType: "inhire" });
  let collectCalls = 0;
  fixture.service.adapters = new Map([
    [
      "inhire",
      {
        sourceType: "inhire",
        collect: async () => {
          collectCalls += 1;
          return [];
        },
      },
    ],
  ]);

  await fixture.service.runJobSource("source-1");
  assert.equal(collectCalls, 1);
});

test("IngestionService dispatches to the teamtailor adapter for teamtailor sources", async () => {
  const fixture = createIngestionServiceFixture({ sourceType: "teamtailor" });
  let collectCalls = 0;
  fixture.service.adapters = new Map([
    [
      "teamtailor",
      {
        sourceType: "teamtailor",
        collect: async () => {
          collectCalls += 1;
          return [];
        },
      },
    ],
  ]);

  await fixture.service.runJobSource("source-1");
  assert.equal(collectCalls, 1);
});

test("IngestionService fails the run for a source type without a registered adapter", async () => {
  const fixture = createIngestionServiceFixture({ sourceType: "solides" });
  fixture.service.adapters = new Map([
    ["custom_html", { sourceType: "custom_html", collect: async () => [] }],
  ]);

  const result = await fixture.service.runJobSource("source-1");

  assert.equal(result.status, "failed");
  assert.match(
    result.errorSummary ?? "",
    /manual ingestion is not supported for source type solides/,
  );
});

test("IngestionService.getRun attaches enrichment info to preview items", async () => {
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
      name: "Enrichment Preview Co",
      normalizedName: `enrichment-preview-co-${randomUUID()}`,
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      checkIntervalMinutes: 30,
      companyId: company.id,
      crawlStrategy: "html",
      parserKey: "custom_html",
      sourceName: "Enrichment Preview Source",
      sourceType: "custom_html",
      sourceUrl: `https://manual.example.com/${randomUUID()}`,
    },
  });

  const result = await service.runJobSource(jobSource.id);
  const jobs = await database.job.findMany({
    where: { jobSourceId: jobSource.id },
    orderBy: { canonicalKey: "asc" },
  });
  assert.equal(jobs.length, 2);

  const enrichments = await database.jobEnrichment.findMany({
    where: { jobId: { in: jobs.map((job) => job.id) } },
  });
  await database.jobEnrichment.update({
    where: { id: enrichments[0]?.id },
    data: {
      careerFingerprint: ["Desenvolvedor Backend", "Java"],
      dominantArea: "SOFTWARE_ENGINEERING",
      enrichmentStatus: "COMPLETED",
    },
  });
  await database.jobEnrichment.update({
    where: { id: enrichments[1]?.id },
    data: {
      enrichmentStatus: "SKIPPED",
      semanticFilterReason: "zona_cinza",
    },
  });

  const run = await service.getRun(jobSource.id, result.id);

  assert.equal(run.previewItems.length, 2);
  const byCanonicalKey = new Map(
    run.previewItems.map((item) => [item.canonicalKey, item]),
  );
  const completedJob = jobs.find((job) => job.id === enrichments[0]?.jobId);
  const skippedJob = jobs.find((job) => job.id === enrichments[1]?.jobId);
  assert.deepEqual(
    byCanonicalKey.get(completedJob?.canonicalKey ?? "")?.enrichment,
    {
      careerFingerprint: ["Desenvolvedor Backend", "Java"],
      dominantArea: "SOFTWARE_ENGINEERING",
      enrichmentStatus: "COMPLETED",
      id: enrichments[0]?.id,
      semanticFilterReason: null,
    },
  );
  assert.deepEqual(
    byCanonicalKey.get(skippedJob?.canonicalKey ?? "")?.enrichment,
    {
      careerFingerprint: [],
      dominantArea: null,
      enrichmentStatus: "SKIPPED",
      id: enrichments[1]?.id,
      semanticFilterReason: "zona_cinza",
    },
  );

  await database.job.deleteMany({ where: { jobSourceId: jobSource.id } });
  await database.jobSource.delete({ where: { id: jobSource.id } });
  await database.company.delete({ where: { id: company.id } });
  await moduleRef.close();
});

test("IngestionService.getRun reports how many titles the crawler filter discarded during that run", async () => {
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
      name: "Discard Count Co",
      normalizedName: `discard-count-co-${randomUUID()}`,
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      checkIntervalMinutes: 30,
      companyId: company.id,
      crawlStrategy: "api",
      parserKey: "gupy",
      sourceName: "Discard Count Source",
      sourceType: "gupy",
      sourceUrl: `https://discard-count.gupy.io/${randomUUID()}`,
    },
  });
  const run = await database.ingestionRun.create({
    data: {
      finishedAt: new Date(),
      jobSourceId: jobSource.id,
      status: "completed",
    },
  });
  const otherRun = await database.ingestionRun.create({
    data: {
      finishedAt: new Date(),
      jobSourceId: jobSource.id,
      status: "completed",
    },
  });

  await database.crawlerDiscardedTitle.createMany({
    data: [
      {
        canonicalKey: `gupy:discard-count:${randomUUID()}`,
        filterReason: "noise_signal:enfermeiro",
        filterVersion: "v1",
        ingestionRunId: run.id,
        jobSourceId: jobSource.id,
        normalizedTitle: "enfermeiro plantonista",
        title: "Enfermeiro Plantonista",
      },
      {
        canonicalKey: `gupy:discard-count:${randomUUID()}`,
        filterReason: "zona_cinza",
        filterVersion: "v1",
        ingestionRunId: run.id,
        jobSourceId: jobSource.id,
        normalizedTitle: "assistente administrativo",
        title: "Assistente Administrativo",
      },
      {
        canonicalKey: `gupy:discard-count:${randomUUID()}`,
        filterReason: "noise_signal:vendedor",
        filterVersion: "v1",
        ingestionRunId: otherRun.id,
        jobSourceId: jobSource.id,
        normalizedTitle: "vendedor",
        title: "Vendedor",
      },
    ],
  });

  const result = await service.getRun(jobSource.id, run.id);

  assert.equal(result.discardedByFilterCount, 2);

  await database.crawlerDiscardedTitle.deleteMany({
    where: { jobSourceId: jobSource.id },
  });
  await database.ingestionRun.deleteMany({
    where: { jobSourceId: jobSource.id },
  });
  await database.jobSource.delete({ where: { id: jobSource.id } });
  await database.company.delete({ where: { id: company.id } });
  await moduleRef.close();
});

test("IngestionService.getRunEnrichmentSummary counts new-job enrichment status", async () => {
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
      name: "Enrichment Summary Co",
      normalizedName: `enrichment-summary-co-${randomUUID()}`,
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      checkIntervalMinutes: 30,
      companyId: company.id,
      crawlStrategy: "html",
      parserKey: "custom_html",
      sourceName: "Enrichment Summary Source",
      sourceType: "custom_html",
      sourceUrl: `https://manual.example.com/${randomUUID()}`,
    },
  });

  const result = await service.runJobSource(jobSource.id);
  const jobs = await database.job.findMany({
    where: { jobSourceId: jobSource.id },
  });
  const enrichments = await database.jobEnrichment.findMany({
    where: { jobId: { in: jobs.map((job) => job.id) } },
  });

  await database.jobEnrichment.update({
    where: { id: enrichments[0]?.id },
    data: { enrichmentStatus: "COMPLETED" },
  });
  await database.jobEnrichment.update({
    where: { id: enrichments[1]?.id },
    data: { enrichmentStatus: "SKIPPED" },
  });

  const summary = await service.getRunEnrichmentSummary(result.id);

  assert.deepEqual(summary, {
    completed: 1,
    failed: 0,
    pending: 0,
    skipped: 1,
    total: 2,
  });

  await database.job.deleteMany({ where: { jobSourceId: jobSource.id } });
  await database.jobSource.delete({ where: { id: jobSource.id } });
  await database.company.delete({ where: { id: company.id } });
  await moduleRef.close();
});

test("IngestionService.getRunEnrichmentSummary returns zeros when the run created no jobs", async () => {
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
      name: "Enrichment Summary Empty Co",
      normalizedName: `enrichment-summary-empty-co-${randomUUID()}`,
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      checkIntervalMinutes: 30,
      companyId: company.id,
      crawlStrategy: "html",
      parserKey: "custom_html",
      sourceName: "Enrichment Summary Empty Source",
      sourceType: "custom_html",
      sourceUrl: `https://manual.example.com/${randomUUID()}`,
    },
  });

  await service.runJobSource(jobSource.id);
  // segunda rodada: mesmos canonicalKeys, action vira "updated" (nao cria
  // JobEnrichment novo).
  const second = await service.runJobSource(jobSource.id);
  assert.equal(second.newCount, 0);

  const summary = await service.getRunEnrichmentSummary(second.id);

  assert.deepEqual(summary, {
    completed: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    total: 0,
  });

  await database.job.deleteMany({ where: { jobSourceId: jobSource.id } });
  await database.jobSource.delete({ where: { id: jobSource.id } });
  await database.company.delete({ where: { id: company.id } });
  await moduleRef.close();
});
