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
import { JobLifecycle } from "../jobs/job-lifecycle.service";
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
  // startedAt da execução concluída anterior (regra de 2 execuções em
  // stale-policy.ts); null = fonte sem execução concluída anterior.
  previousCompletedRunStartedAt?: Date | null;
  sourceType?: JobSourceType;
  webRevalidationThrows?: boolean;
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
  const staleCutoffs: Date[] = [];
  const previousCompletedRunStartedAt =
    options?.previousCompletedRunStartedAt === undefined
      ? new Date("2026-05-31T12:00:00.000Z")
      : options.previousCompletedRunStartedAt;
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
      findFirst: async ({ where }: { where: { status?: string } }) =>
        where.status === "completed" && previousCompletedRunStartedAt
          ? { startedAt: previousCompletedRunStartedAt }
          : null,
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
            // Casa com o título default (item.title ?? item.canonicalKey =
            // "job-a") e a descriptionClean fixa do adapter mockado abaixo
            // ("desc") — permite testar contentChanged nos dois sentidos
            // sem precisar de outro fixture.
            title: "job-a",
            descriptionClean: "desc",
            slug: "job-a-slug",
            status: "active",
          };
        }

        if (where.canonicalKey === "job-reappear") {
          return {
            id: "job-reappear-id",
            canonicalKey: "job-reappear",
            firstSeenAt: new Date("2026-05-01T10:00:00.000Z"),
            lastSeenAt: new Date("2026-05-10T10:00:00.000Z"),
            slug: "job-reappear-slug",
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
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const status = where.status;
        const lastSeenAt = where.lastSeenAt as { lt?: Date } | undefined;
        if (status === "active" && lastSeenAt?.lt) {
          staleCutoffs.push(lastSeenAt.lt);
          return Array.from({ length: staleUpdateManyCount }, (_, i) => ({
            slug: `stale-job-${i}`,
          }));
        }
        return [];
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

  const revalidationCalls: Array<{ slug: string | null; reason: string }> = [];
  const webRevalidation = {
    requestJobRevalidation: (slug: string | null, reason: string) => {
      revalidationCalls.push({ slug, reason });
      if (options?.webRevalidationThrows) {
        throw new Error("webhook misbehaving");
      }
    },
  };

  // JobLifecycle de verdade sobre o banco fake: o fluxo de vaga parada passa
  // por closeJobs (status + URL_DELETED + revalidação) e o upsert por
  // onStatusChanged. A fila da Indexing API é um fake que registra.
  const indexingCalls: Array<{ slug: string; type: "indexing" | "removal" }> =
    [];
  const indexingQueue = {
    enqueue: async (
      items: Array<{ slug: string; type: "URL_UPDATED" | "URL_DELETED" }>,
    ) => {
      for (const item of items) {
        indexingCalls.push({
          slug: item.slug,
          type: item.type === "URL_DELETED" ? "removal" : "indexing",
        });
      }
      return items.length;
    },
  };
  const lifecycleDatabase = {
    job: {
      // closeJobs consulta com { AND: [where, { status: { not } }] }; o fake
      // do banco entende o where original.
      findMany: async ({
        where,
      }: {
        where: { AND?: Array<Record<string, unknown>> };
      }) => {
        const original = where.AND?.[0] ?? where;
        const rows = await database.job.findMany({ where: original });
        return rows.map((row) => ({ ...row, id: row.slug, status: "active" }));
      },
      updateMany: async () => ({ count: 0 }),
    },
  };
  const jobLifecycle = new JobLifecycle(
    lifecycleDatabase as never,
    indexingQueue,
    {
      requestJobRevalidation: (slug, reason) =>
        webRevalidation.requestJobRevalidation(slug ?? null, reason),
    },
  );

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
    { sourceType: "talentbrew", collect: async () => [] } as never,
    { sourceType: "workday", collect: async () => [] } as never,
    { sourceType: "pandape", collect: async () => [] } as never,
    { sourceType: "eightfold", collect: async () => [] } as never,
    { sourceType: "solides", collect: async () => [] } as never,
    jobLifecycle as never,
    webRevalidation as never,
  );

  return {
    collectContext: () => collectContext,
    createdJobs,
    indexingCalls,
    rawJobUpdates,
    revalidationCalls,
    service,
    staleCutoffs,
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

test("IngestionService notifies Google Indexing API removal for each job marked stale", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a" }],
  });
  fixture.setStaleCount(2);

  await fixture.service.runJobSource("source-1");

  const removals = fixture.indexingCalls.filter(
    (call) => call.type === "removal",
  );
  assert.equal(removals.length, 2);
  assert.deepEqual(removals.map((call) => call.slug).sort(), [
    "stale-job-0",
    "stale-job-1",
  ]);
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

test("IngestionService omits contentUpdatedAt from the update payload when title/descriptionClean did not change", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a" }],
  });

  await fixture.service.runJobSource("source-1");

  const jobAUpdate = fixture.rawJobUpdates.find(
    (call) => call.where.id === "job-a-id",
  );
  assert.ok(jobAUpdate, "expected an update call for the existing job");
  assert.equal(
    jobAUpdate.data.contentUpdatedAt,
    undefined,
    "contentUpdatedAt must stay untouched when the observation matches the persisted title/description",
  );
});

test("IngestionService sets contentUpdatedAt on the update payload when title changed at the source", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a", title: "Titulo Novo Da Fonte" }],
  });

  await fixture.service.runJobSource("source-1");

  const jobAUpdate = fixture.rawJobUpdates.find(
    (call) => call.where.id === "job-a-id",
  );
  assert.ok(jobAUpdate, "expected an update call for the existing job");
  assert.ok(
    jobAUpdate.data.contentUpdatedAt instanceof Date,
    "contentUpdatedAt must be set when title diverges from what's persisted",
  );
});

test("IngestionService requests web cache invalidation ('inactivated') for each job marked stale", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a" }],
  });
  fixture.setStaleCount(2);

  await fixture.service.runJobSource("source-1");

  const inactivated = fixture.revalidationCalls.filter(
    (call) => call.reason === "inactivated",
  );
  assert.deepEqual(inactivated.map((call) => call.slug).sort(), [
    "stale-job-0",
    "stale-job-1",
  ]);
});

test("IngestionService requests 'published' when a previously inactive job reappears", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-reappear" }],
  });

  await fixture.service.runJobSource("source-1");

  assert.deepEqual(fixture.revalidationCalls, [
    { slug: "job-reappear-slug", reason: "published" },
  ]);
});

test("IngestionService requests 'updated' only when title/description really changed on an active job", async () => {
  const unchanged = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a" }],
  });
  await unchanged.service.runJobSource("source-1");
  assert.deepEqual(unchanged.revalidationCalls, []);

  const changed = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a", title: "Titulo Novo Da Fonte" }],
  });
  await changed.service.runJobSource("source-1");
  assert.deepEqual(changed.revalidationCalls, [
    { slug: "job-a-slug", reason: "updated" },
  ]);
});

test("IngestionService requests 'inactivated' when the source reports an active job as closed", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a", status: "inactive" }],
  });

  await fixture.service.runJobSource("source-1");

  assert.deepEqual(fixture.revalidationCalls, [
    { slug: "job-a-slug", reason: "inactivated" },
  ]);
});

test("IngestionService keeps running and reports success when the web revalidation service misbehaves", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [
      { canonicalKey: "job-a", title: "Titulo Novo Da Fonte" },
      { canonicalKey: "job-reappear" },
    ],
    webRevalidationThrows: true,
  });
  fixture.setStaleCount(2);

  const result = await fixture.service.runJobSource("source-1");

  assert.equal(result.status, "completed");
  assert.equal(result.failedCount, 0);
  assert.equal(result.staleMarkedCount, 2);
  // Google Indexing continua sendo notificado mesmo com o webhook quebrado.
  assert.equal(
    fixture.indexingCalls.filter((call) => call.type === "removal").length,
    2,
  );
  assert.ok(fixture.revalidationCalls.length >= 3);
});

test("IngestionService works without any web revalidation service configured", async () => {
  // Constrói sem o 14º argumento opcional (comportamento anterior).
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a", title: "Outro Titulo" }],
  });
  const service = fixture.service as unknown as {
    webRevalidation?: unknown;
    runJobSource: (id: string) => Promise<{ status: string }>;
  };
  service.webRevalidation = undefined;

  const result = await service.runJobSource("source-1");

  assert.equal(result.status, "completed");
});

test("IngestionService inactivates jobs missing from the current and the previous completed run", async () => {
  const previousRun = new Date("2026-05-31T12:00:00.000Z");
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a" }],
    previousCompletedRunStartedAt: previousRun,
  });
  fixture.setStaleCount(1);

  const result = await fixture.service.runJobSource("source-1");

  assert.equal(result.staleMarkedCount, 1);
  assert.deepEqual(fixture.staleCutoffs, [previousRun]);
});

test("IngestionService falls back to the 7-day rule when the source has no previous completed run", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [{ canonicalKey: "job-a" }],
    previousCompletedRunStartedAt: null,
  });
  fixture.setStaleCount(1);

  const before = Date.now();
  await fixture.service.runJobSource("source-1");

  const cutoff = fixture.staleCutoffs[0]?.getTime() ?? 0;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  assert.ok(cutoff <= before - sevenDays + 60_000);
  assert.ok(cutoff >= before - sevenDays - 60_000);
});

test("IngestionService falls back to the 7-day rule when the run returns no observations", async () => {
  const fixture = createIngestionServiceFixture({
    observations: [],
    previousCompletedRunStartedAt: new Date("2026-05-31T12:00:00.000Z"),
  });
  fixture.setStaleCount(1);

  const before = Date.now();
  await fixture.service.runJobSource("source-1");

  const cutoff = fixture.staleCutoffs[0]?.getTime() ?? 0;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  assert.ok(cutoff <= before - sevenDays + 60_000);
  assert.ok(cutoff >= before - sevenDays - 60_000);
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

// Regressão: gupy/inhire/talentbrew/workday mandam uma observação "leve"
// (detailFetchSkipped=true) só pra manter lastSeenAt fresco sem repetir o
// fetch caro de detalhe — mas ela vem com descriptionClean/descriptionRaw/
// locationText degenerados (workday/inhire/talentbrew: descriptionClean=
// title, descriptionRaw=""; gupy: os dois vazios). Sem essa guarda em
// upsertObservation, todo recrawl "leve" apagava a descrição real já salva.
test("IngestionService preserves the existing job's description/location when the observation is detailFetchSkipped", async () => {
  const fixture = createIngestionServiceFixture();
  fixture.service.adapters = new Map([
    [
      "custom_html",
      {
        sourceType: "custom_html",
        collect: async () => [
          {
            canonicalKey: "job-a",
            city: undefined,
            country: "Brasil",
            // Degenerado de propósito — igual ao que workday/inhire/
            // talentbrew mandam numa observação leve.
            descriptionClean: "job-a",
            descriptionRaw: "",
            detailFetchSkipped: true,
            firstSeenAt: "2026-06-01T10:00:00.000Z",
            lastSeenAt: "2026-06-02T10:00:00.000Z",
            locationText: "Remote",
            normalizedTitle: "job a",
            sourceJobUrl: "https://jobs.example.com/job-a",
            state: undefined,
            status: "active",
            title: "job-a",
          },
        ],
      },
    ],
  ]);

  await fixture.service.runJobSource("source-1");

  const jobAUpdate = fixture.rawJobUpdates.find(
    (call) => call.where.id === "job-a-id",
  );
  assert.ok(jobAUpdate, "expected an update call for the existing job");
  assert.equal(
    jobAUpdate.data.descriptionClean,
    undefined,
    "descriptionClean must stay untouched (not overwritten with the title)",
  );
  assert.equal(
    jobAUpdate.data.descriptionRaw,
    undefined,
    "descriptionRaw must stay untouched",
  );
  assert.equal(
    jobAUpdate.data.locationText,
    undefined,
    "locationText must stay untouched",
  );
  assert.equal(
    jobAUpdate.data.contentUpdatedAt,
    undefined,
    "a detailFetchSkipped observation never counts as a real content change",
  );
  // lastSeenAt e status continuam sendo o motivo de existir dessa
  // observação leve — isso sim precisa atualizar.
  assert.ok(jobAUpdate.data.lastSeenAt instanceof Date);
  assert.equal(
    (jobAUpdate.data.lastSeenAt as Date).toISOString(),
    "2026-06-02T10:00:00.000Z",
  );
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

test("IngestionService dispatches to the talentbrew adapter for talentbrew sources", async () => {
  const fixture = createIngestionServiceFixture({ sourceType: "talentbrew" });
  let collectCalls = 0;
  fixture.service.adapters = new Map([
    [
      "talentbrew",
      {
        sourceType: "talentbrew",
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

test("IngestionService dispatches to the workday adapter for workday sources", async () => {
  const fixture = createIngestionServiceFixture({ sourceType: "workday" });
  let collectCalls = 0;
  fixture.service.adapters = new Map([
    [
      "workday",
      {
        sourceType: "workday",
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
  const fixture = createIngestionServiceFixture({ sourceType: "lgcloud" });
  fixture.service.adapters = new Map([
    ["custom_html", { sourceType: "custom_html", collect: async () => [] }],
  ]);

  const result = await fixture.service.runJobSource("source-1");

  assert.equal(result.status, "failed");
  assert.match(
    result.errorSummary ?? "",
    /manual ingestion is not supported for source type lgcloud/,
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

test("IngestionService.listAllRuns paginates, filters, and omits previewJson from the list payload", async () => {
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
  const uniqueSuffix = randomUUID();
  const company = await database.company.create({
    data: {
      name: `List Runs Co ${uniqueSuffix}`,
      normalizedName: `list-runs-co-${uniqueSuffix}`,
    },
  });
  const jobSource = await database.jobSource.create({
    data: {
      checkIntervalMinutes: 30,
      companyId: company.id,
      crawlStrategy: "html",
      parserKey: "custom_html",
      sourceName: "List Runs Source",
      sourceType: "custom_html",
      sourceUrl: `https://manual.example.com/${randomUUID()}`,
    },
  });

  // 3 runs pra esse source: um "failed" e dois "completed", cada um com
  // previewJson populado — a lista nunca deveria devolver esse blob.
  await database.ingestionRun.create({
    data: {
      jobSourceId: jobSource.id,
      previewJson: [{ canonicalKey: "a", action: "created", title: "A" }],
      startedAt: new Date("2026-08-01T10:00:00.000Z"),
      status: "failed",
    },
  });
  await database.ingestionRun.create({
    data: {
      jobSourceId: jobSource.id,
      previewJson: [{ canonicalKey: "b", action: "created", title: "B" }],
      startedAt: new Date("2026-08-02T10:00:00.000Z"),
      status: "completed",
    },
  });
  await database.ingestionRun.create({
    data: {
      jobSourceId: jobSource.id,
      previewJson: [{ canonicalKey: "c", action: "created", title: "C" }],
      startedAt: new Date("2026-08-03T10:00:00.000Z"),
      status: "completed",
    },
  });

  const firstPage = await service.listAllRuns({
    limit: 2,
    page: 1,
    query: uniqueSuffix,
  });
  assert.equal(firstPage.total, 3);
  assert.equal(firstPage.runs.length, 2);
  // orderBy startedAt desc: run mais recente primeiro.
  assert.equal(firstPage.runs[0]?.startedAt, "2026-08-03T10:00:00.000Z");
  assert.deepEqual(firstPage.runs[0]?.previewItems, []);

  const secondPage = await service.listAllRuns({
    limit: 2,
    page: 2,
    query: uniqueSuffix,
  });
  assert.equal(secondPage.runs.length, 1);
  assert.equal(secondPage.runs[0]?.startedAt, "2026-08-01T10:00:00.000Z");

  const onlyFailed = await service.listAllRuns({
    query: jobSource.sourceName,
    status: "failed",
  });
  assert.equal(onlyFailed.total, 1);
  assert.equal(onlyFailed.runs[0]?.status, "failed");

  const noMatch = await service.listAllRuns({ query: "no-such-company-xyz" });
  assert.equal(noMatch.total, 0);

  await database.ingestionRun.deleteMany({
    where: { jobSourceId: jobSource.id },
  });
  await database.jobSource.delete({ where: { id: jobSource.id } });
  await database.company.delete({ where: { id: company.id } });
  await moduleRef.close();
});

test("IngestionService.listRuns pagina no banco e nunca carrega previewJson", async () => {
  const fixture = createIngestionServiceFixture();
  const database = fixture.service.database as unknown as {
    ingestionRun: Record<string, unknown>;
    jobSource: Record<string, unknown>;
  };
  database.jobSource.findUnique = async () => ({ id: "source-1" });
  let findManyArgs: Record<string, unknown> | undefined;
  let countArgs: Record<string, unknown> | undefined;
  database.ingestionRun.findMany = async (args: Record<string, unknown>) => {
    findManyArgs = args;
    return [
      {
        errorSummary: null,
        failedCount: 0,
        finishedAt: new Date("2026-10-01T10:05:00.000Z"),
        id: "run-9",
        jobSourceId: "source-1",
        newCount: 2,
        skippedCount: 0,
        startedAt: new Date("2026-10-01T10:00:00.000Z"),
        status: "completed",
        updatedCount: 1,
      },
    ];
  };
  database.ingestionRun.count = async (args: Record<string, unknown>) => {
    countArgs = args;
    return 61;
  };

  const result = await fixture.service.listRuns("source-1", {
    limit: 25,
    page: 3,
  });

  assert.deepEqual(findManyArgs?.omit, { previewJson: true });
  assert.equal(findManyArgs?.skip, 50);
  assert.equal(findManyArgs?.take, 25);
  assert.deepEqual(findManyArgs?.where, { jobSourceId: "source-1" });
  assert.deepEqual(countArgs, { where: { jobSourceId: "source-1" } });
  assert.equal(result.total, 61);
  assert.equal(result.page, 3);
  assert.equal(result.limit, 25);
  assert.equal(result.runs[0].id, "run-9");
  assert.deepEqual(result.runs[0].previewItems, []);
});

test("IngestionService.listRuns limita o tamanho da pagina a 100", async () => {
  const fixture = createIngestionServiceFixture();
  const database = fixture.service.database as unknown as {
    ingestionRun: Record<string, unknown>;
    jobSource: Record<string, unknown>;
  };
  database.jobSource.findUnique = async () => ({ id: "source-1" });
  let take: unknown;
  database.ingestionRun.findMany = async (args: { take: number }) => {
    take = args.take;
    return [];
  };
  database.ingestionRun.count = async () => 0;

  const result = await fixture.service.listRuns("source-1", { limit: 5000 });

  assert.equal(take, 100);
  assert.equal(result.page, 1);
});
