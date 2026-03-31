import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const rootPackageJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../package.json"), "utf8"),
) as {
  scripts?: Record<string, string | undefined>;
};

const apiPackageJson = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../../apps/api/package.json"),
    "utf8",
  ),
) as {
  scripts?: Record<string, string | undefined>;
};

test("root workspace bootstraps shared package builds after install", () => {
  assert.equal(rootPackageJson.scripts?.postinstall, "npm run build:packages");
  assert.equal(rootPackageJson.scripts?.predev, undefined);
  assert.equal(rootPackageJson.scripts?.["predev:api"], undefined);
  assert.equal(rootPackageJson.scripts?.precheck, undefined);
});

test("api workspace uses source-resolution for dev, build, check, and test", () => {
  assert.equal(
    apiPackageJson.scripts?.dev,
    "NODE_OPTIONS='--conditions=development' nest start --watch",
  );
  assert.equal(
    apiPackageJson.scripts?.build,
    "NODE_OPTIONS='--conditions=development' nest build",
  );
  assert.equal(
    apiPackageJson.scripts?.check,
    "NODE_OPTIONS='--conditions=development' biome check --config-path ../../biome.json .",
  );
  assert.equal(
    apiPackageJson.scripts?.test,
    `sh -c 'set -a && . ./.env.test && set +a && if [ "$#" -gt 0 ]; then NODE_OPTIONS="--conditions=development" tsx --test "$@"; else NODE_OPTIONS="--conditions=development" tsx --test src/**/*.spec.ts src/**/*.e2e-spec.ts; fi' --`,
  );
});

test("api workspace only prebuilds shared packages for compiled runtime entrypoints", () => {
  assert.equal(
    apiPackageJson.scripts?.["build:shared"],
    "npm run build --workspace @earlycv/config --workspace @earlycv/database --workspace @earlycv/queue --workspace @earlycv/storage --workspace @earlycv/ai",
  );
  assert.equal(apiPackageJson.scripts?.prestart, "npm run build:shared");
  assert.equal(apiPackageJson.scripts?.predev, undefined);
  assert.equal(apiPackageJson.scripts?.prebuild, undefined);
  assert.equal(apiPackageJson.scripts?.precheck, undefined);
  assert.equal(apiPackageJson.scripts?.pretest, undefined);
});
