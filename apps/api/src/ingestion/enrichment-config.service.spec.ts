import assert from "node:assert/strict";
import { test } from "node:test";

import type { IngestionSchedulerConfig } from "@prisma/client";
import type { DatabaseService } from "../database/database.service";
import { EnrichmentConfigService } from "./enrichment-config.service";

function createConfig(
  overrides: Partial<IngestionSchedulerConfig> = {},
): IngestionSchedulerConfig {
  return {
    id: "global",
    enabled: false,
    globalCron: null,
    timezone: "America/Sao_Paulo",
    normalDelayMs: 45000,
    errorDelayMs: 90000,
    enrichmentEnabled: true,
    enrichmentCronExpression: "*/10 * * * * *",
    enrichmentBatchSize: 10,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createDatabaseMock(config: IngestionSchedulerConfig) {
  let upsertCalls = 0;
  let stored = config;

  const database = {
    ingestionSchedulerConfig: {
      upsert: async ({
        update,
      }: {
        update: Partial<IngestionSchedulerConfig>;
      }) => {
        upsertCalls += 1;
        stored = { ...stored, ...update };
        return stored;
      },
      findUnique: async () => stored,
    },
  } as unknown as DatabaseService;

  return {
    database,
    getStored: () => stored,
    getUpsertCalls: () => upsertCalls,
  };
}

test("EnrichmentConfigService.getConfig respects cache TTL and does not hit the database on consecutive calls", async () => {
  let now = 0;
  const { database, getUpsertCalls } = createDatabaseMock(createConfig());
  const service = new EnrichmentConfigService(database, {
    cacheTtlMs: 60_000,
    now: () => now,
  });

  await service.getConfig();
  await service.getConfig();
  assert.equal(getUpsertCalls(), 1);

  now += 59_000;
  await service.getConfig();
  assert.equal(getUpsertCalls(), 1);

  now += 2_000;
  await service.getConfig();
  assert.equal(getUpsertCalls(), 2);
});

test("EnrichmentConfigService.updateConfig persists fields and invalidates cache", async () => {
  const { database, getStored } = createDatabaseMock(createConfig());
  const service = new EnrichmentConfigService(database);

  await service.getConfig();
  const updated = await service.updateConfig({
    enrichmentBatchSize: 25,
    enrichmentEnabled: false,
  });

  assert.equal(updated.enrichmentBatchSize, 25);
  assert.equal(updated.enrichmentEnabled, false);
  assert.equal(getStored().enrichmentBatchSize, 25);

  const reread = await service.getConfig();
  assert.equal(reread.enrichmentBatchSize, 25);
});

test("EnrichmentConfigService.updateConfig rejects an invalid cron expression", async () => {
  const { database } = createDatabaseMock(createConfig());
  const service = new EnrichmentConfigService(database);

  await assert.rejects(
    () => service.updateConfig({ enrichmentCronExpression: "*/15 * * * *" }),
    /enrichmentCronExpression/,
  );
});

test("EnrichmentConfigService.updateConfig rejects a non-positive batch size", async () => {
  const { database } = createDatabaseMock(createConfig());
  const service = new EnrichmentConfigService(database);

  await assert.rejects(
    () => service.updateConfig({ enrichmentBatchSize: 0 }),
    /enrichmentBatchSize/,
  );
});
