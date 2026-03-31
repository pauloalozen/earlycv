import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "./app.module";

test("AppModule wires the catalog and jobs routes into the API", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  await app.init();

  for (const path of ["/api/companies", "/api/job-sources", "/api/jobs"]) {
    const response = await request(app.getHttpServer()).get(path);

    assert.equal(response.status, 401, `${path} should be mounted and guarded`);
  }

  await app.close();
});
