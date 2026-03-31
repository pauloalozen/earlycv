import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { isQueueName, plannedQueues, queueNames } from "./queues.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  exports: {
    ".": {
      development?: string;
      default: string;
      types: string;
    };
  };
};

const sourceIndex = readFileSync(
  new URL("./index.ts", import.meta.url),
  "utf8",
);

test("plannedQueues list the workflow contracts in delivery order", () => {
  assert.deepEqual(
    plannedQueues.map((queue) => queue.name),
    [
      queueNames.crawlScheduling,
      queueNames.jobIngestion,
      queueNames.fitRecompute,
      queueNames.alertDispatch,
      queueNames.resumeTailoringAudit,
    ],
  );
});

test("isQueueName only accepts registered queue names", () => {
  assert.equal(isQueueName(queueNames.jobIngestion), true);
  assert.equal(isQueueName("jobs:unknown"), false);
});

test("queue package exposes development source exports and compiled default runtime", () => {
  assert.equal(packageJson.exports["."].development, "./src/index.ts");
  assert.equal(packageJson.exports["."].default, "./dist/index.js");
  assert.equal(packageJson.exports["."].types, "./src/index.ts");
});

test("queue development entrypoint uses source-safe relative imports", () => {
  assert.equal(sourceIndex.includes("./queues.js"), true);
  assert.equal(existsSync(new URL("./queues.js", import.meta.url)), true);
});
