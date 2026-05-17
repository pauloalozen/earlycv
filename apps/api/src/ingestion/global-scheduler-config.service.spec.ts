import assert from "node:assert/strict";
import { test } from "node:test";

import { GlobalSchedulerConfigService } from "./global-scheduler-config.service";

test("getConfig recovers from concurrent create unique violation", async () => {
  const expected = {
    createdAt: new Date(),
    enabled: false,
    errorDelayMs: 90000,
    globalCron: null,
    id: "global",
    normalDelayMs: 45000,
    timezone: "America/Sao_Paulo",
    updatedAt: new Date(),
  };

  const database = {
    ingestionSchedulerConfig: {
      upsert: async () => {
        throw { code: "P2002" };
      },
      findUnique: async () => expected,
    },
  };

  const service = new GlobalSchedulerConfigService(database as never);
  const result = await service.getConfig();

  assert.deepEqual(result, expected);
});

test("updateConfig falls back to update after unique violation", async () => {
  const updated = {
    createdAt: new Date(),
    enabled: true,
    errorDelayMs: 90000,
    globalCron: "* * * * *",
    id: "global",
    normalDelayMs: 45000,
    timezone: "America/Sao_Paulo",
    updatedAt: new Date(),
  };

  let updateCalled = false;

  const database = {
    ingestionSchedulerConfig: {
      upsert: async () => {
        throw { code: "P2002" };
      },
      update: async () => {
        updateCalled = true;
        return updated;
      },
    },
  };

  const service = new GlobalSchedulerConfigService(database as never);
  const result = await service.updateConfig({
    enabled: true,
    errorDelayMs: 90000,
    globalCron: "* * * * *",
    normalDelayMs: 45000,
    timezone: "America/Sao_Paulo",
  });

  assert.equal(updateCalled, true);
  assert.deepEqual(result, updated);
});
