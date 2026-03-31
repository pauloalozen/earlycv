import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { defineEnv, envToNumber } from "./env.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  exports: {
    "./env": {
      development?: string;
      default: string;
      types: string;
    };
  };
};

test("defineEnv applies defaults and parsing from the TypeScript source module", () => {
  const readEnv = defineEnv({
    API_PORT: {
      default: "4000",
      parse: (value, key) => envToNumber(value, key),
    },
  });

  assert.deepEqual(readEnv({}), {
    API_PORT: 4000,
  });
});

test("config package exposes development source env output and compiled default runtime", () => {
  assert.equal(packageJson.exports["./env"].development, "./src/env.ts");
  assert.equal(packageJson.exports["./env"].default, "./dist/env.js");
  assert.equal(packageJson.exports["./env"].types, "./src/env.ts");
});
