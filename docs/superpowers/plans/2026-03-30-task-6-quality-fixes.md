# Task 6 Quality Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove config env duplication, make workspace package exports/builds less order-dependent for local development, fix the repo check regression, and clarify the intentional scaffolding in the database package.

**Architecture:** Keep each package authored from TypeScript source only, generate declarations/build output to `dist`, and point workspace runtime exports at `src` while types come from `dist`. This preserves practical local consumption during monorepo development without hand-maintained JS/DTS files, while still keeping an explicit package build step and typed outputs.

**Tech Stack:** npm workspaces, TypeScript, tsx, Biome, Prisma, OpenAI SDK

---

### Task 1: Convert `@earlycv/config` to single-source TypeScript

**Files:**
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/src/env.spec.ts`
- Modify: `packages/config/package.json`
- Modify: `packages/config/src/env.ts`
- Delete: `packages/config/src/env.js`
- Delete: `packages/config/src/env.d.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { defineEnv, envToNumber } from "./env.js";

test("defineEnv applies defaults and parsing from the TypeScript source module", () => {
  const readEnv = defineEnv({
    API_PORT: {
      default: "4000",
      parse: (value, key) => envToNumber(value, key),
    },
  });

  assert.deepEqual(readEnv({}), { API_PORT: 4000 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @earlycv/config`
Expected: FAIL because the config package has no `test` script yet.

- [ ] **Step 3: Write minimal implementation**

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "biome lint --config-path ../../biome.json .",
    "check": "biome check --config-path ../../biome.json . && tsc -p tsconfig.json --noEmit",
    "test": "tsx --test src/**/*.spec.ts"
  },
  "exports": {
    "./env": {
      "types": "./dist/env.d.ts",
      "default": "./src/env.ts"
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @earlycv/config`
Expected: PASS

### Task 2: Make workspace library exports coherent for local development

**Files:**
- Modify: `packages/database/package.json`
- Modify: `packages/queue/package.json`
- Modify: `packages/storage/package.json`
- Modify: `packages/ai/package.json`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import packageJson from "../package.json" assert { type: "json" };

test("workspace package exports point runtime to src and types to dist", () => {
  assert.equal(packageJson.exports["."].default.startsWith("./src/"), true);
  assert.equal(packageJson.exports["."].types.startsWith("./dist/"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @earlycv/queue`
Expected: FAIL because current runtime exports point at `dist`.

- [ ] **Step 3: Write minimal implementation**

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./src/index.ts"
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @earlycv/queue`
Expected: PASS

### Task 3: Make database scaffolding explicitly intentional

**Files:**
- Modify: `packages/database/src/client.spec.ts`
- Modify: `packages/database/src/client.ts`
- Modify: `packages/database/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("database package exposes an intentional bootstrap stage identifier", () => {
  assert.equal(databaseScaffold.stage, "bootstrap");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @earlycv/database`
Expected: FAIL because the scaffold metadata export does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export const databaseScaffold = {
  description: "Minimal Prisma bootstrap for EarlyCV infrastructure packages.",
  stage: "bootstrap",
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @earlycv/database`
Expected: PASS

### Task 4: Fix the existing root check failure

**Files:**
- Modify: `apps/api/src/config/env.module.spec.ts`

- [ ] **Step 1: Write the failing test**

```text
No new behavioral test needed; this is a formatting-only repo check failure.
```

- [ ] **Step 2: Run check to verify it fails**

Run: `npm run check`
Expected: FAIL with Biome import ordering complaint in `apps/api/src/config/env.module.spec.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
```

- [ ] **Step 4: Run check to verify it passes**

Run: `npm run check`
Expected: PASS for the previously failing file.

### Task 5: Run final validation for the touched strategy

**Files:**
- Validate only

- [ ] **Step 1: Run targeted package verification**

Run: `npm test --workspace @earlycv/config && npm test --workspace @earlycv/database && npm test --workspace @earlycv/queue && npm test --workspace @earlycv/storage && npm test --workspace @earlycv/ai`
Expected: PASS

- [ ] **Step 2: Run targeted checks/builds**

Run: `npm run check --workspace @earlycv/config && npm run check --workspace @earlycv/database && npm run check --workspace @earlycv/queue && npm run check --workspace @earlycv/storage && npm run check --workspace @earlycv/ai && npm run build --workspace @earlycv/config && npm run build --workspace @earlycv/database && npm run build --workspace @earlycv/queue && npm run build --workspace @earlycv/storage && npm run build --workspace @earlycv/ai`
Expected: PASS

- [ ] **Step 3: Run root validation**

Run: `npm run check && npm run build`
Expected: PASS if no unrelated regressions remain.
