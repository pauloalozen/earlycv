import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const envExample = readFileSync(
  resolve(import.meta.dirname, "../../../.env.example"),
  "utf8",
);

const dockerCompose = readFileSync(
  resolve(import.meta.dirname, "../../../docker-compose.yml"),
  "utf8",
);

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

const webPackageJson = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../../apps/web/package.json"),
    "utf8",
  ),
) as {
  scripts?: Record<string, string | undefined>;
};

const aiPackageJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../ai/package.json"), "utf8"),
) as {
  scripts?: Record<string, string | undefined>;
};

test("root workspace bootstraps shared package builds after install", () => {
  assert.equal(rootPackageJson.scripts?.postinstall, "npm run build:packages");
  assert.equal(rootPackageJson.scripts?.predev, undefined);
  assert.equal(rootPackageJson.scripts?.["predev:api"], undefined);
  assert.equal(rootPackageJson.scripts?.precheck, undefined);
  assert.equal(
    rootPackageJson.scripts?.check?.includes("$(pwd)/biome.json"),
    true,
  );
  assert.equal(rootPackageJson.scripts?.check?.includes("apps packages"), true);
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
    apiPackageJson.scripts?.check?.includes("$(realpath ../../biome.json)"),
    true,
  );
  assert.equal(apiPackageJson.scripts?.check?.includes("src"), true);
  assert.equal(apiPackageJson.scripts?.test?.includes("./.env.test"), true);
  assert.equal(apiPackageJson.scripts?.test?.includes("../../.env"), true);
  assert.equal(
    apiPackageJson.scripts?.test?.includes("../../.env.example"),
    true,
  );
  assert.equal(
    apiPackageJson.scripts?.test?.includes("DATABASE_TEST_URL"),
    true,
  );
  assert.equal(
    apiPackageJson.scripts?.["test:database"]?.includes("DATABASE_TEST_URL"),
    true,
  );
  assert.equal(
    apiPackageJson.scripts?.test?.includes("DATABASE_TEST_URL is required"),
    true,
  );
  assert.equal(
    apiPackageJson.scripts?.["test:database"]?.includes(
      "DATABASE_TEST_URL is required",
    ),
    true,
  );
});

test("workspace check scripts target source files explicitly inside worktrees", () => {
  assert.equal(
    webPackageJson.scripts?.check?.includes("$(realpath ../../biome.json)"),
    true,
  );
  assert.equal(webPackageJson.scripts?.check?.includes("src"), true);
  assert.equal(
    aiPackageJson.scripts?.check?.includes("$(realpath ../../biome.json)"),
    true,
  );
  assert.equal(aiPackageJson.scripts?.check?.includes("src"), true);
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

test("env example documents a dedicated test database URL", () => {
  assert.equal(envExample.includes("DATABASE_TEST_URL="), true);
  assert.equal(envExample.includes("earlycv_test"), true);
});

test("docker compose bootstraps a dedicated test database on fresh Postgres volumes", () => {
  assert.equal(dockerCompose.includes("POSTGRES_TEST_DB"), true);
  assert.equal(dockerCompose.includes("docker/postgres/init"), true);
});
