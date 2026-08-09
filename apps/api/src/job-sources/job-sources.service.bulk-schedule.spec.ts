import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { JobSourcesService } from "./job-sources.service";

test("bulkUpdateSchedule runs a single updateMany scoped to the adapter", async () => {
  let received: unknown;
  const database = {
    jobSource: {
      updateMany: async (args: unknown) => {
        received = args;
        return { count: 164 };
      },
    },
  };

  const service = new JobSourcesService(database as never, {} as never);

  const result = await service.bulkUpdateSchedule({
    sourceType: "gupy" as never,
    scheduleEnabled: false,
  });

  assert.deepEqual(received, {
    where: { sourceType: "gupy" },
    data: { scheduleEnabled: false },
  });
  assert.equal(result.count, 164);
  assert.equal(result.scheduleEnabled, false);
  assert.equal(result.sourceType, "gupy");
});
