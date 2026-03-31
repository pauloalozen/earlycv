import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { Test } from "@nestjs/testing";

import { AppModule } from "../app.module";
import { InfraService } from "./infra.service";

test("InfraService exposes workspace infrastructure diagnostics", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const infraService = moduleRef.get(InfraService);

  assert.deepEqual(await infraService.getDiagnostics(), {
    ai: {
      defaultProvider: "openai",
      supportedProviders: ["openai"],
    },
    database: {
      stage: "bootstrap",
    },
    queue: {
      count: 5,
      names: [
        "crawl:scheduling",
        "jobs:ingestion",
        "jobs:fit-recompute",
        "alerts:dispatch",
        "resume-tailoring:audit",
      ],
    },
    storage: {
      driver: "memory",
    },
  });
});
