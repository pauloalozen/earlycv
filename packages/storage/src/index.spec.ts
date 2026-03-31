import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { defineStorageDriver } from "./index.js";

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

test("defineStorageDriver returns the provided driver contract", () => {
  const driver = defineStorageDriver({
    deleteObject: async () => undefined,
    getObject: async () => ({
      body: Buffer.from("resume"),
      contentType: "application/pdf",
      key: "resumes/candidate.pdf",
      size: 6,
    }),
    putObject: async () => ({
      contentType: "application/pdf",
      key: "resumes/candidate.pdf",
      size: 6,
      url: "https://cdn.earlycv.dev/resumes/candidate.pdf",
    }),
  });

  assert.equal(typeof driver.putObject, "function");
  assert.equal(typeof driver.getObject, "function");
  assert.equal(typeof driver.deleteObject, "function");
});

test("storage package exposes development source exports and compiled default runtime", () => {
  assert.equal(packageJson.exports["."].development, "./src/index.ts");
  assert.equal(packageJson.exports["."].default, "./dist/index.js");
  assert.equal(packageJson.exports["."].types, "./src/index.ts");
});
