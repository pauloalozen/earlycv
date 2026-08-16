import assert from "node:assert/strict";
import { test } from "node:test";

import { LOGO_FETCH_SUPPORTED_ADAPTERS } from "./company-logo/logo-extractors";
import { ManualIngestionBatchRepository } from "./manual-ingestion-batch.repository";

test("repository creates adapter batch with queued items", async () => {
  const createdRun = {
    id: "batch-1",
    scopeType: "adapter",
    scopeValue: "gupy",
    status: "queued",
    totalSources: 2,
  };

  let createManyPayload: Array<Record<string, unknown>> = [];
  let capturedSourceWhere: Record<string, unknown> | undefined;
  const tx = {
    ingestionBatchRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assert.equal(data.scopeType, "adapter");
        assert.equal(data.scopeValue, "gupy");
        return createdRun;
      },
    },
    jobSource: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedSourceWhere = where;
        return [
          {
            id: "source-1",
            companyId: "company-1",
            company: { name: "Company 1" },
            sourceName: "Source 1",
            sourceType: "gupy",
          },
          {
            id: "source-2",
            companyId: "company-2",
            company: { name: "Company 2" },
            sourceName: "Source 2",
            sourceType: "gupy",
          },
        ];
      },
    },
    ingestionBatchItem: {
      createMany: async ({
        data,
      }: {
        data: Array<Record<string, unknown>>;
      }) => {
        createManyPayload = data;
        return { count: 2 };
      },
    },
  };
  const database = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => callback(tx),
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  const result = await repository.createAdapterBatchRun({
    adapterType: "gupy",
    requestedByUserId: "admin-1",
  });

  assert.equal(result.status, "queued");
  assert.equal(result.totalSources, 2);
  assert.equal(createManyPayload.length, 2);
  assert.equal(
    capturedSourceWhere?.scheduleEnabled,
    true,
    "escopo ADAPTER so deve pegar fontes com o toggle de agendamento ligado",
  );
});

test("repository creates logo fetch batch scoped to one adapter, deduped by company", async () => {
  const createdRun = {
    id: "batch-logo-1",
    scopeType: "adapter",
    scopeValue: "gupy",
    status: "queued",
    totalSources: 1,
  };

  let createManyPayload: Array<Record<string, unknown>> = [];
  let capturedSourceWhere: Record<string, unknown> | undefined;
  const tx = {
    ingestionBatchRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assert.equal(data.runKind, "LOGO_FETCH");
        assert.equal(data.scopeType, "adapter");
        assert.equal(data.scopeValue, "gupy");
        return createdRun;
      },
    },
    jobSource: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedSourceWhere = where;
        // Mesma companyId em 2 fontes — so 1 item deve entrar no batch.
        return [
          {
            id: "source-1",
            companyId: "company-1",
            company: { name: "Company 1" },
            sourceName: "Source 1",
            sourceType: "gupy",
          },
          {
            id: "source-1b",
            companyId: "company-1",
            company: { name: "Company 1" },
            sourceName: "Source 1b",
            sourceType: "gupy",
          },
        ];
      },
    },
    ingestionBatchItem: {
      createMany: async ({
        data,
      }: {
        data: Array<Record<string, unknown>>;
      }) => {
        createManyPayload = data;
        return { count: data.length };
      },
    },
  };
  const database = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => callback(tx),
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  const result = await repository.createLogoFetchBatchRun({
    adapterType: "gupy",
  });

  assert.equal(result.status, "queued");
  assert.equal(createManyPayload.length, 1);
  assert.deepEqual(capturedSourceWhere?.sourceType, { in: ["gupy"] });
  assert.equal(
    "scheduleEnabled" in (capturedSourceWhere ?? {}),
    false,
    "logo fetch nao deve depender do toggle de agendamento de CRAWL",
  );
});

test("repository creates logo fetch batch for all supported adapters when adapterType is omitted", async () => {
  const createdRun = {
    id: "batch-logo-all",
    scopeType: "global",
    scopeValue: "all",
    status: "queued",
    totalSources: 0,
  };

  let capturedSourceWhere: Record<string, unknown> | undefined;
  const tx = {
    ingestionBatchRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assert.equal(data.scopeType, "global");
        assert.equal(data.scopeValue, "all");
        return createdRun;
      },
    },
    jobSource: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedSourceWhere = where;
        return [];
      },
    },
  };
  const database = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => callback(tx),
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  const result = await repository.createLogoFetchBatchRun({});

  assert.equal(result.totalSources, 0);
  // Sem adapterType, o filtro cobre todos os adapters com extractor de
  // logo implementado — compara contra a constante real em vez de uma
  // lista fixa, pra não quebrar esse teste a cada novo adapter.
  assert.deepEqual(capturedSourceWhere?.sourceType, {
    in: LOGO_FETCH_SUPPORTED_ADAPTERS,
  });
});

test("repository filters by company sem logo quando onlyMissingLogo=true (delta)", async () => {
  let capturedSourceWhere: Record<string, unknown> | undefined;
  const tx = {
    ingestionBatchRun: {
      create: async () => ({
        id: "batch-logo-delta",
        scopeType: "global",
        scopeValue: "all",
        status: "queued",
        totalSources: 0,
      }),
    },
    jobSource: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedSourceWhere = where;
        return [];
      },
    },
  };
  const database = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => callback(tx),
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  await repository.createLogoFetchBatchRun({ onlyMissingLogo: true });

  assert.deepEqual(capturedSourceWhere?.company, { logoUrl: null });
});

test("repository não filtra por logoUrl quando onlyMissingLogo é omitido/false", async () => {
  let capturedSourceWhere: Record<string, unknown> | undefined;
  const tx = {
    ingestionBatchRun: {
      create: async () => ({
        id: "batch-logo-full",
        scopeType: "global",
        scopeValue: "all",
        status: "queued",
        totalSources: 0,
      }),
    },
    jobSource: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedSourceWhere = where;
        return [];
      },
    },
  };
  const database = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => callback(tx),
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  await repository.createLogoFetchBatchRun({});

  assert.equal(capturedSourceWhere?.company, undefined);
});

test("repository creates discovery validate batch — 1 item por DiscoveredCompany PENDING, sem jobSourceId/companyId", async () => {
  let capturedCandidateWhere: Record<string, unknown> | undefined;
  let createManyPayload: Array<Record<string, unknown>> = [];
  const tx = {
    ingestionBatchRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assert.equal(data.runKind, "DISCOVERY_VALIDATE");
        assert.equal(data.scopeType, "global");
        assert.equal(data.scopeValue, "30");
        return {
          id: "batch-discovery",
          scopeType: "global",
          scopeValue: "30",
          status: "queued",
          totalSources: 2,
        };
      },
    },
    discoveredCompany: {
      findMany: async ({
        where,
        take,
      }: {
        where: Record<string, unknown>;
        take: number;
      }) => {
        capturedCandidateWhere = where;
        assert.equal(take, 30);
        return [
          { id: "candidate-1", name: "Empresa A" },
          { id: "candidate-2", name: "Empresa B" },
        ];
      },
    },
    ingestionBatchItem: {
      createMany: async ({
        data,
      }: {
        data: Array<Record<string, unknown>>;
      }) => {
        createManyPayload = data;
        return { count: data.length };
      },
    },
  };
  const database = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => callback(tx),
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  const result = await repository.createDiscoveryValidateBatchRun({
    candidateLimit: 30,
  });

  assert.equal(result.status, "queued");
  assert.deepEqual(capturedCandidateWhere, { status: "PENDING" });
  assert.equal(createManyPayload.length, 2);
  assert.equal(createManyPayload[0]?.discoveredCompanyId, "candidate-1");
  assert.equal(createManyPayload[0]?.companyName, "Empresa A");
  assert.equal("jobSourceId" in createManyPayload[0], false);
});

test("repository lists runs with optional filters", async () => {
  let capturedWhere: Record<string, unknown> | undefined;
  const database = {
    ingestionBatchRun: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedWhere = where;
        return [];
      },
    },
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  await repository.listRuns({ scopeType: "adapter", status: "queued" });

  assert.deepEqual(capturedWhere, { scopeType: "adapter", status: "queued" });
});

test("repository gets run by id and lists filtered items", async () => {
  let capturedItemWhere: Record<string, unknown> | undefined;
  const database = {
    ingestionBatchRun: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        assert.deepEqual(where, { id: "batch-1" });
        return { id: "batch-1" };
      },
    },
    ingestionBatchItem: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        capturedItemWhere = where;
        return [];
      },
    },
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  const run = await repository.getRunById("batch-1");
  await repository.listRunItems("batch-1", { status: "queued" });

  assert.deepEqual(run, { id: "batch-1" });
  assert.deepEqual(capturedItemWhere, {
    batchRunId: "batch-1",
    status: "queued",
  });
});

test("repository marks cancel requested with status transition", async () => {
  const now = new Date();
  const database = {
    ingestionBatchRun: {
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        assert.deepEqual(where, {
          id: "batch-1",
          status: { in: ["queued", "running"] },
        });
        assert.equal(data.status, "cancelling");
        assert.equal(data.cancelRequestedAt instanceof Date, true);
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        assert.deepEqual(where, { id: "batch-1" });
        return { id: "batch-1", status: "cancelling", cancelRequestedAt: now };
      },
    },
  };

  const repository = new ManualIngestionBatchRepository(database as never);
  const result = await repository.markCancelRequested("batch-1");

  assert.equal(result.status, "cancelling");
});
