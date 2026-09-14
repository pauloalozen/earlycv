import assert from "node:assert/strict";
import { test } from "node:test";

import { JobCurationService } from "./job-curation.service";

function buildDatabaseStub(
  overrides: {
    job?: Partial<{
      findMany: (...args: unknown[]) => unknown;
      count: (...args: unknown[]) => unknown;
      findUnique: (...args: unknown[]) => unknown;
    }>;
    jobEnrichment?: Partial<{ groupBy: (...args: unknown[]) => unknown }>;
    jobLinkedinCuration?: Partial<{ upsert: (...args: unknown[]) => unknown }>;
  } = {},
) {
  return {
    job: {
      findMany: async () => [],
      count: async () => 0,
      findUnique: async () => ({ id: "job-1" }),
      ...overrides.job,
    },
    jobEnrichment: {
      groupBy: async () => [],
      ...overrides.jobEnrichment,
    },
    jobLinkedinCuration: {
      upsert: async (args: unknown) => args,
      ...overrides.jobLinkedinCuration,
    },
  };
}

test("listJobs applies the São Paulo day boundary and requested filters to the where clause", async () => {
  let capturedWhere: unknown;
  const database = buildDatabaseStub({
    job: {
      findMany: async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return [];
      },
      count: async () => 0,
    },
  });
  const service = new JobCurationService(database as never);

  await service.listJobs({
    period: "date",
    date: "2026-01-05",
    seniorityFilter: "SENIOR",
    areaFilter: "SOFTWARE_ENGINEERING",
    companyFilter: "Acme",
    workModelFilter: "remote",
    locationFilter: "São Paulo",
    curationStatusFilter: "NOT_FOUND_ON_LINKEDIN",
  } as never);

  const and = (capturedWhere as { AND: Array<Record<string, unknown>> }).AND;

  assert.deepEqual(and[0], {
    firstSeenAt: {
      gte: new Date("2026-01-05T03:00:00.000Z"),
      lt: new Date("2026-01-06T03:00:00.000Z"),
    },
  });
  assert.deepEqual(
    and.find((c) => "company" in c),
    {
      company: { name: { contains: "Acme", mode: "insensitive" } },
    },
  );
  assert.deepEqual(
    and.find((c) => "workModel" in c),
    { workModel: "remote" },
  );
  assert.deepEqual(
    and.find((c) => "locationText" in c),
    {
      locationText: { contains: "São Paulo", mode: "insensitive" },
    },
  );
  assert.deepEqual(
    and.find((c) => "enrichment" in c),
    {
      enrichment: { dominantArea: "SOFTWARE_ENGINEERING", seniority: "SENIOR" },
    },
  );
  assert.deepEqual(
    and.find((c) => "linkedinCuration" in c),
    {
      linkedinCuration: { status: "NOT_FOUND_ON_LINKEDIN" },
    },
  );
});

test("listJobs treats NOT_CHECKED as either missing curation row or an explicit NOT_CHECKED row", async () => {
  let capturedWhere: unknown;
  const database = buildDatabaseStub({
    job: {
      findMany: async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return [];
      },
      count: async () => 0,
    },
  });
  const service = new JobCurationService(database as never);

  await service.listJobs({
    period: "today",
    curationStatusFilter: "NOT_CHECKED",
  } as never);

  const and = (capturedWhere as { AND: Array<Record<string, unknown>> }).AND;
  assert.deepEqual(
    and.find((c) => "OR" in c),
    {
      OR: [
        { linkedinCuration: null },
        { linkedinCuration: { status: "NOT_CHECKED" } },
      ],
    },
  );
});

test("getSeniorityCounters ignores seniorityFilter (it does not exist on the DTO) and folds missing/incomplete enrichment into semEnriquecimento", async () => {
  const database = buildDatabaseStub({
    jobEnrichment: {
      groupBy: async () => [
        { seniority: "JUNIOR", _count: { _all: 3 } },
        { seniority: "SENIOR", _count: { _all: 2 } },
        { seniority: null, _count: { _all: 1 } },
      ],
    },
    job: {
      findMany: async () => [],
      count: async () => 5, // vagas sem nenhuma linha de enrichment
    },
  });
  const service = new JobCurationService(database as never);

  const result = await service.getSeniorityCounters({
    period: "today",
  } as never);

  const junior = result.bySeniority.find((s) => s.seniority === "JUNIOR");
  const senior = result.bySeniority.find((s) => s.seniority === "SENIOR");
  const mid = result.bySeniority.find((s) => s.seniority === "MID");

  assert.equal(junior?.count, 3);
  assert.equal(senior?.count, 2);
  assert.equal(mid?.count, 0);
  // 5 sem linha de enrichment + 1 com enrichment mas seniority nulo
  assert.equal(result.semEnriquecimento, 6);
});

test("setCurationStatus requires linkedinUrl when status is FOUND_ON_LINKEDIN", async () => {
  const database = buildDatabaseStub();
  const service = new JobCurationService(database as never);

  await assert.rejects(
    () =>
      service.setCurationStatus(
        "job-1",
        { status: "FOUND_ON_LINKEDIN" } as never,
        "admin-1",
      ),
    /linkedinUrl is required/,
  );
});

test("setCurationStatus rejects a linkedinUrl whose host is not linkedin.com or a subdomain", async () => {
  const database = buildDatabaseStub();
  const service = new JobCurationService(database as never);

  await assert.rejects(() =>
    service.setCurationStatus(
      "job-1",
      {
        status: "FOUND_ON_LINKEDIN",
        linkedinUrl: "https://notlinkedin.com/jobs/view/123",
      } as never,
      "admin-1",
    ),
  );

  await assert.rejects(() =>
    service.setCurationStatus(
      "job-1",
      {
        status: "FOUND_ON_LINKEDIN",
        linkedinUrl: "https://linkedin.com.evil.com/jobs/view/123",
      } as never,
      "admin-1",
    ),
  );

  await assert.rejects(() =>
    service.setCurationStatus(
      "job-1",
      {
        status: "FOUND_ON_LINKEDIN",
        linkedinUrl: "http://linkedin.com/jobs/view/123",
      } as never,
      "admin-1",
    ),
  );
});

test("setCurationStatus accepts linkedin.com and real subdomains over https", async () => {
  let upsertArgs: unknown;
  const database = buildDatabaseStub({
    jobLinkedinCuration: {
      upsert: async (args: unknown) => {
        upsertArgs = args;
        return args;
      },
    },
  });
  const service = new JobCurationService(database as never);

  await service.setCurationStatus(
    "job-1",
    {
      status: "FOUND_ON_LINKEDIN",
      linkedinUrl: "https://www.linkedin.com/jobs/view/123",
    } as never,
    "admin-1",
  );

  const create = (upsertArgs as { create: Record<string, unknown> }).create;
  assert.equal(create.linkedinUrl, "https://www.linkedin.com/jobs/view/123");
  assert.equal(create.checkedByAdminId, "admin-1");
  assert.ok(create.checkedAt instanceof Date);
});

test("setCurationStatus forces linkedinUrl to null for any status other than FOUND_ON_LINKEDIN", async () => {
  let upsertArgs: unknown;
  const database = buildDatabaseStub({
    jobLinkedinCuration: {
      upsert: async (args: unknown) => {
        upsertArgs = args;
        return args;
      },
    },
  });
  const service = new JobCurationService(database as never);

  await service.setCurationStatus(
    "job-1",
    {
      status: "NOT_FOUND_ON_LINKEDIN",
      // Mesmo que o cliente mande uma URL, o service descarta.
      linkedinUrl: "https://www.linkedin.com/jobs/view/123",
    } as never,
    "admin-1",
  );

  const create = (upsertArgs as { create: Record<string, unknown> }).create;
  assert.equal(create.linkedinUrl, null);
});

test("setCurationStatus records checkedAt/checkedByAdminId even when resetting back to NOT_CHECKED", async () => {
  let upsertArgs: unknown;
  const database = buildDatabaseStub({
    jobLinkedinCuration: {
      upsert: async (args: unknown) => {
        upsertArgs = args;
        return args;
      },
    },
  });
  const service = new JobCurationService(database as never);

  await service.setCurationStatus(
    "job-1",
    { status: "NOT_CHECKED" } as never,
    "admin-2",
  );

  const create = (upsertArgs as { create: Record<string, unknown> }).create;
  assert.equal(create.status, "NOT_CHECKED");
  assert.equal(create.linkedinUrl, null);
  assert.equal(create.checkedByAdminId, "admin-2");
  assert.ok(create.checkedAt instanceof Date);
});

test("setCurationStatus throws when the job does not exist", async () => {
  const database = buildDatabaseStub({
    job: { findUnique: async () => null },
  });
  const service = new JobCurationService(database as never);

  await assert.rejects(() =>
    service.setCurationStatus(
      "missing-job",
      { status: "NOT_CHECKED" } as never,
      "admin-1",
    ),
  );
});
