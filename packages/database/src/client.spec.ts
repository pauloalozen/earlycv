import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

process.env.DATABASE_URL ??=
  "postgresql://earlycv:earlycv@localhost:5432/earlycv?schema=public";

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
  scripts: {
    lint?: string;
    check?: string;
    pretest?: string;
    generate: string;
    migrate: string;
    seed: string;
  };
};

const sourceIndex = readFileSync(
  new URL("./index.ts", import.meta.url),
  "utf8",
);

const { createDatabaseClient, databaseScaffold, getDatabaseClient } =
  await import("./index.js");

test("createDatabaseClient returns a Prisma client instance", async () => {
  const client = createDatabaseClient({
    log: ["warn"],
  });

  assert.equal(typeof client.$connect, "function");
  await client.$disconnect();
});

test("getDatabaseClient reuses a singleton outside production", async () => {
  const databaseScope = globalThis as typeof globalThis & {
    __earlycvPrisma?: unknown;
  };
  const processEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;

  databaseScope.__earlycvPrisma = undefined;
  processEnv.NODE_ENV = "test";

  const firstClient = getDatabaseClient();
  const secondClient = getDatabaseClient();

  assert.equal(firstClient, secondClient);

  await firstClient.$disconnect();

  databaseScope.__earlycvPrisma = undefined;

  if (previousNodeEnv === undefined) {
    delete processEnv.NODE_ENV;
  } else {
    processEnv.NODE_ENV = previousNodeEnv;
  }
});

test("database package exposes development source exports and compiled default runtime", () => {
  assert.equal(packageJson.exports["."].development, "./src/index.ts");
  assert.equal(packageJson.exports["."].default, "./dist/index.js");
  assert.equal(packageJson.exports["."].types, "./src/index.ts");
});

test("database workspace scripts load the root env file before Prisma commands", () => {
  for (const scriptName of ["generate", "migrate", "seed"] as const) {
    assert.equal(
      packageJson.scripts[scriptName].includes("../../.env"),
      true,
      `${scriptName} should source ../../.env before running`,
    );
  }
});

test("database workspace scripts fall back to the root env example when local env is missing", () => {
  assert.equal(
    packageJson.scripts.generate.includes("../../.env.example"),
    true,
    "generate should fall back to ../../.env.example before running",
  );
  for (const scriptName of ["migrate", "seed"] as const) {
    assert.equal(
      packageJson.scripts[scriptName].includes("../../.env.example"),
      false,
      `${scriptName} should fail closed instead of sourcing ../../.env.example`,
    );
  }
});

test("database mutating scripts require an explicit DATABASE_URL when no root env exists", () => {
  for (const scriptName of ["migrate", "seed"] as const) {
    assert.equal(
      packageJson.scripts[scriptName].includes("DATABASE_URL is required"),
      true,
      `${scriptName} should stop when DATABASE_URL is unavailable`,
    );
  }
});

test("database workspace scripts preserve an explicitly exported DATABASE_URL", () => {
  for (const scriptName of ["generate", "migrate", "seed"] as const) {
    assert.equal(
      packageJson.scripts[scriptName].includes("DATABASE_URL:-"),
      true,
      `${scriptName} should not override an existing DATABASE_URL`,
    );
  }
});

test("database tests generate Prisma Client before running", () => {
  assert.equal(
    packageJson.scripts.pretest,
    "npm run generate --workspace @earlycv/database",
  );
});

test("database package check script validates Prisma sources as well as TypeScript", () => {
  assert.equal(packageJson.scripts.check?.includes("prisma"), true);
  assert.equal(packageJson.scripts.lint?.includes("prisma"), true);
});

test("database development entrypoint uses source-safe relative imports", () => {
  assert.equal(sourceIndex.includes("./client.js"), true);
  assert.equal(existsSync(new URL("./client.js", import.meta.url)), true);
});

test("database scaffolding is explicitly marked as bootstrap infrastructure", () => {
  assert.deepEqual(databaseScaffold, {
    description:
      "Minimal Prisma bootstrap scaffolding for EarlyCV workspace development.",
    stage: "bootstrap",
  });
});
