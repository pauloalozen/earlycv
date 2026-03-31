import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";

test("GET /api/health returns the API health payload", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  await app.init();

  const response = await request(app.getHttpServer()).get("/api/health");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    service: "api",
  });

  await app.close();
});
