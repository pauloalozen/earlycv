# Job Ingestion Crawler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real job ingestion for `gupy` and `greenhouse` with per-source capture rules, filtered persistence, and audited ingestion runs.

**Architecture:** Extend the existing ingestion service instead of replacing it. Add source adapters for `gupy` and `greenhouse`, a shared capture-rule engine, and richer run accounting. Persist source-specific capture policy on `JobSource`, keep `Job` identity anchored on `canonicalKey` and `firstSeenAt`, and expose source configuration and run feedback through the admin/API surface.

**Tech Stack:** NestJS, Prisma, Next.js App Router, TypeScript, Node test runner, server-side admin pages

---

### Task 1: Add capture policy and richer run metrics to the database model

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_add_job_source_capture_rules_and_ingestion_summary/migration.sql`
- Modify: `packages/database/src/schema.spec.ts`
- Verify: generated Prisma client usage in `apps/api/src/database/database.service.ts`

- [ ] **Step 1: Write the failing schema assertions for capture policy and run summary fields**

```ts
test("job sources support capture rules and ingestion runs store filtered counters", () => {
  const jobSource = getBlock("model", "JobSource");
  const ingestionRun = getBlock("model", "IngestionRun");

  assert.match(jobSource, /^\s*captureRulesJson\s+Json\?$/m);
  assert.match(ingestionRun, /^\s*discoveredCount\s+Int\s+@default\(0\)$/m);
  assert.match(ingestionRun, /^\s*acceptedCount\s+Int\s+@default\(0\)$/m);
  assert.match(ingestionRun, /^\s*filteredOutCount\s+Int\s+@default\(0\)$/m);
  assert.match(ingestionRun, /^\s*summaryJson\s+Json\?$/m);
});
```

- [ ] **Step 2: Run the schema test to verify it fails**

Run: `npm run test --workspace @earlycv/database -- src/schema.spec.ts`
Expected: FAIL because `captureRulesJson`, `discoveredCount`, `acceptedCount`, `filteredOutCount`, and `summaryJson` do not exist yet.

- [ ] **Step 3: Add the Prisma fields and migration**

```prisma
model JobSource {
  // existing fields...
  captureRulesJson Json?
}

model IngestionRun {
  // existing fields...
  discoveredCount  Int  @default(0)
  acceptedCount    Int  @default(0)
  filteredOutCount Int  @default(0)
  summaryJson      Json?
}
```

```sql
ALTER TABLE "JobSource" ADD COLUMN "captureRulesJson" JSONB;
ALTER TABLE "IngestionRun" ADD COLUMN "discoveredCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IngestionRun" ADD COLUMN "acceptedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IngestionRun" ADD COLUMN "filteredOutCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IngestionRun" ADD COLUMN "summaryJson" JSONB;
```

- [ ] **Step 4: Generate Prisma client and rerun the schema test**

Run: `npm run generate --workspace @earlycv/database && npm run test --workspace @earlycv/database -- src/schema.spec.ts`
Expected: PASS.

### Task 2: Extend job-source DTOs and service to store capture policy

**Files:**
- Modify: `apps/api/src/job-sources/dto/create-job-source.dto.ts`
- Modify: `apps/api/src/job-sources/dto/update-job-source.dto.ts`
- Modify: `apps/api/src/job-sources/job-sources.service.ts`
- Modify: `apps/api/src/job-sources/job-sources.e2e-spec.ts`
- Create: `apps/api/src/job-sources/capture-rules.ts`

- [ ] **Step 1: Write failing job-source API tests for capture policy persistence**

```ts
test("job sources persist capture rules on create and update", async () => {
  // create source with captureRulesJson include/exclude config
  // expect response.captureRulesJson.includeKeywords to contain "dados"
  // update source with excludeKeywords and expect persisted changes
});
```

- [ ] **Step 2: Run the job-source tests to verify they fail**

Run: `npm run test --workspace @earlycv/api -- src/job-sources/job-sources.e2e-spec.ts`
Expected: FAIL because DTOs and service do not accept capture policy yet.

- [ ] **Step 3: Add capture-rule DTO validation and service persistence**

```ts
export type CaptureRules = {
  includeKeywords?: string[];
  excludeKeywords?: string[];
  includeDepartments?: string[];
  excludeDepartments?: string[];
  notes?: string;
};
```

Persist `captureRulesJson` directly through `create()` and `update()` after sanitizing trimmed string arrays.

- [ ] **Step 4: Run the job-source tests again**

Run: `npm run test --workspace @earlycv/api -- src/job-sources/job-sources.e2e-spec.ts`
Expected: PASS.

### Task 3: Add the shared capture-rule engine

**Files:**
- Create: `apps/api/src/ingestion/capture-rules.ts`
- Create: `apps/api/src/ingestion/capture-rules.spec.ts`
- Modify: `apps/api/src/ingestion/types.ts`

- [ ] **Step 1: Write failing tests for inclusion, exclusion, and open-capture behavior**

```ts
test("capture rules reject excluded operational roles before include matching", () => {
  const result = evaluateCaptureRules(
    {
      includeKeywords: ["dados", "tecnologia"],
      excludeKeywords: ["operador", "producao"],
    },
    {
      title: "Operador de producao",
      department: "Industrial",
      descriptionText: "Linha fabril",
    },
  );

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "exclude-keyword");
});
```

- [ ] **Step 2: Run the capture-rule test to verify it fails**

Run: `npm run test --workspace @earlycv/api -- src/ingestion/capture-rules.spec.ts`
Expected: FAIL because the engine does not exist yet.

- [ ] **Step 3: Implement the minimal rule evaluator**

Implement normalized lowercase matching against title, department, and description text with this priority:

1. department exclusions
2. keyword exclusions
3. if includes exist, require at least one department or keyword include
4. otherwise accept

- [ ] **Step 4: Run the capture-rule test again**

Run: `npm run test --workspace @earlycv/api -- src/ingestion/capture-rules.spec.ts`
Expected: PASS.

### Task 4: Add real adapter fixtures and contracts for Gupy and Greenhouse

**Files:**
- Create: `apps/api/src/ingestion/adapters/gupy.adapter.ts`
- Create: `apps/api/src/ingestion/adapters/greenhouse.adapter.ts`
- Modify: `apps/api/src/ingestion/adapters/index.ts`
- Modify: `apps/api/src/ingestion/types.ts`
- Create: `apps/api/src/ingestion/fixtures/gupy-listing.json`
- Create: `apps/api/src/ingestion/fixtures/gupy-detail.json`
- Create: `apps/api/src/ingestion/fixtures/greenhouse-listing.json`
- Create: `apps/api/src/ingestion/fixtures/greenhouse-detail.json`
- Create: `apps/api/src/ingestion/adapters/gupy.adapter.spec.ts`
- Create: `apps/api/src/ingestion/adapters/greenhouse.adapter.spec.ts`

- [ ] **Step 1: Write failing adapter tests against fixtures**

```ts
test("Gupy adapter normalizes discovered jobs with stable canonical identity", async () => {
  const adapter = new GupyAdapter();
  const jobs = await adapter.collect(mockGupySourceContext);

  assert.equal(jobs.length > 0, true);
  assert.match(jobs[0]!.canonicalKey, /^gupy:/);
  assert.equal(typeof jobs[0]!.descriptionText, "string");
});
```

- [ ] **Step 2: Run both adapter tests to verify they fail**

Run: `npm run test --workspace @earlycv/api -- src/ingestion/adapters/gupy.adapter.spec.ts src/ingestion/adapters/greenhouse.adapter.spec.ts`
Expected: FAIL because the adapters are not implemented.

- [ ] **Step 3: Implement minimal real adapters backed by source-specific fetch/normalize code**

Requirements:
- Gupy adapter reads listing + detail and emits normalized jobs
- Greenhouse adapter reads board listing + detail and emits normalized jobs
- canonical keys are built from source type + source identity + remote job identity

- [ ] **Step 4: Run the adapter tests again**

Run: `npm run test --workspace @earlycv/api -- src/ingestion/adapters/gupy.adapter.spec.ts src/ingestion/adapters/greenhouse.adapter.spec.ts`
Expected: PASS.

### Task 5: Refactor ingestion service to apply filtering and richer run accounting

**Files:**
- Modify: `apps/api/src/ingestion/ingestion.service.ts`
- Modify: `apps/api/src/ingestion/ingestion.service.spec.ts`
- Modify: `apps/api/src/ingestion/types.ts`

- [ ] **Step 1: Write failing ingestion service tests for accepted, filtered, failed, and stable-first-seen flows**

```ts
test("IngestionService filters operational jobs and keeps firstSeenAt stable", async () => {
  // seed source with captureRulesJson include/exclude policy
  // run once and assert acceptedCount/filter counts
  // run again with changed details and assert firstSeenAt unchanged
});
```

- [ ] **Step 2: Run the ingestion service tests to verify they fail**

Run: `npm run test --workspace @earlycv/api -- src/ingestion/ingestion.service.spec.ts`
Expected: FAIL because run accounting and filtering logic are not implemented.

- [ ] **Step 3: Implement the minimal orchestration changes**

Implementation requirements:
- store `discoveredCount`, `acceptedCount`, `filteredOutCount`, `failedCount`
- sample filtered and failed items into `summaryJson`
- apply `evaluateCaptureRules()` before upsert
- do not persist filtered jobs
- preserve `firstSeenAt` when updating an existing accepted job

- [ ] **Step 4: Run the ingestion service tests again**

Run: `npm run test --workspace @earlycv/api -- src/ingestion/ingestion.service.spec.ts`
Expected: PASS.

### Task 6: Expose richer run data and capture policy through admin-facing APIs

**Files:**
- Modify: `apps/api/src/ingestion/ingestion.controller.ts`
- Modify: `apps/api/src/job-sources/job-sources.controller.ts`
- Modify: `apps/api/src/job-sources/job-sources.e2e-spec.ts`
- Modify: `apps/api/src/ingestion/ingestion.service.ts`

- [ ] **Step 1: Write failing controller/e2e tests for capture policy visibility and richer run summaries**

```ts
test("GET job source and run endpoints expose capture rules and filtering metrics", async () => {
  // expect response.captureRulesJson to exist
  // expect run summary to include discoveredCount/acceptedCount/filteredOutCount/summaryJson
});
```

- [ ] **Step 2: Run the API tests to verify they fail**

Run: `npm run test --workspace @earlycv/api -- src/job-sources/job-sources.e2e-spec.ts src/ingestion/ingestion.service.spec.ts`
Expected: FAIL until the new fields are surfaced.

- [ ] **Step 3: Implement the response shape updates**

Update API summaries and controller responses so admin consumers can see capture policy and run-level filtering/accounting data.

- [ ] **Step 4: Run the tests again**

Run: `npm run test --workspace @earlycv/api -- src/job-sources/job-sources.e2e-spec.ts src/ingestion/ingestion.service.spec.ts`
Expected: PASS.

### Task 7: Update admin web screens for source capture policy and run diagnostics

**Files:**
- Modify: `apps/web/src/lib/admin-ingestion-api.ts`
- Modify: `apps/web/src/app/admin/fontes/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/fontes/[id]/runs/[runId]/page.tsx`
- Modify: `apps/web/src/app/admin/fontes/nova/page.tsx`
- Modify: `apps/web/src/app/admin/ingestion/[jobSourceId]/page.tsx`
- Modify: `apps/web/src/app/admin/ingestion/[jobSourceId]/runs/[runId]/page.tsx`
- Create: `apps/web/src/lib/admin-capture-rules.ts`
- Create: `apps/web/src/lib/admin-capture-rules.spec.ts`

- [ ] **Step 1: Write failing web tests for rendering capture rules and richer run diagnostics where testable**

```ts
test("formatCaptureRulesSummary renders include and exclude rules for admin review", () => {
  assert.match(
    formatCaptureRulesSummary({ includeKeywords: ["dados"], excludeKeywords: ["operador"] }),
    /dados/,
  );
});
```

- [ ] **Step 2: Run the web test to verify it fails**

Run: `npx tsx --test apps/web/src/lib/admin-capture-rules.spec.ts`
Expected: FAIL because helper/UI support does not exist.

- [ ] **Step 3: Implement the minimal admin UI changes**

Requirements:
- edit and display capture rules on source pages
- show discovered/accepted/filtered/failed metrics on run pages
- surface sampled filtered/failure examples when present

- [ ] **Step 4: Run the web test again**

Run: `npx tsx --test apps/web/src/lib/admin-capture-rules.spec.ts`
Expected: PASS.

### Task 8: Verify affected workspaces end-to-end

**Files:**
- Verify only

- [ ] **Step 1: Run API targeted tests for adapters, capture rules, job sources, and ingestion**

Run: `npm run test --workspace @earlycv/api -- src/ingestion/capture-rules.spec.ts src/ingestion/adapters/gupy.adapter.spec.ts src/ingestion/adapters/greenhouse.adapter.spec.ts src/ingestion/ingestion.service.spec.ts src/job-sources/job-sources.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 2: Run the full API workspace test suite**

Run: `npm run test --workspace @earlycv/api`
Expected: PASS.

- [ ] **Step 3: Run API checks**

Run: `npm run check --workspace @earlycv/api`
Expected: PASS.

- [ ] **Step 4: Run web checks**

Run: `npm run check --workspace @earlycv/web`
Expected: PASS.

- [ ] **Step 5: Run web build**

Run: `npm run build --workspace @earlycv/web`
Expected: PASS.
