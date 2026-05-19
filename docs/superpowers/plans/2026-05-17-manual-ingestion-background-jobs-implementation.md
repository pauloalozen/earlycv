# Manual Ingestion Background Jobs (Adapter Scope) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-blocking manual ingestion by adapter, with persisted background jobs, progress/log visibility, and cancel controls in admin.

**Architecture:** Introduce a persisted batch/job model (`IngestionBatchRun` + `IngestionBatchItem`) in Prisma, expose admin endpoints to start/list/detail/cancel batch runs, and add a background runner service that processes queued items sequentially using existing ingestion locks and `IngestionService.runJobSource`. Update admin ingestion UI to trigger adapter-scoped runs asynchronously and render operational logs/cancel actions.

**Tech Stack:** NestJS, Prisma, Next.js App Router, TypeScript, node:test, Tailwind CSS v4.

---

### Task 1: Add database models and migration for manual batch runs

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_manual_ingestion_background_jobs/migration.sql`
- Modify: `apps/api/.railway-redeploy`

- [ ] **Step 1: Write the failing integration assertion in API test (DB fields expected by new endpoint response)**

```ts
// in ingestion endpoint integration spec
assert.equal(typeof body.batchRunId, "string");
assert.equal(body.status, "queued");
```

- [ ] **Step 2: Run targeted test to verify it fails (missing table/model path)**

Run: `npm run test --workspace apps/api -- src/ingestion/ingestion.controller.spec.ts`
Expected: FAIL with Prisma/model/table missing for batch run persistence.

- [ ] **Step 3: Add Prisma models/enums (minimal implementation)**

```prisma
enum IngestionBatchScopeType {
  adapter
  source
  global
}

enum IngestionBatchRunStatus {
  queued
  running
  completed
  failed
  cancelling
  cancelled
}

enum IngestionBatchItemStatus {
  queued
  running
  completed
  failed
  skipped
  cancelled
}
```

- [ ] **Step 4: Add `IngestionBatchRun` and `IngestionBatchItem` models with FKs and indexes**

```prisma
model IngestionBatchRun {
  id                String                 @id @default(cuid())
  scopeType         IngestionBatchScopeType
  scopeValue        String
  status            IngestionBatchRunStatus @default(queued)
  requestedByUserId String
  startedAt         DateTime?
  finishedAt        DateTime?
  cancelRequestedAt DateTime?
  totalSources      Int                    @default(0)
  succeededCount    Int                    @default(0)
  failedCount       Int                    @default(0)
  skippedCount      Int                    @default(0)
  createdAt         DateTime               @default(now())
  updatedAt         DateTime               @updatedAt
  items             IngestionBatchItem[]

  @@index([status, createdAt])
}
```

- [ ] **Step 5: Create migration and touch Railway marker**

Run: `npm run migrate --workspace @earlycv/database -- --name manual_ingestion_background_jobs`
Then: `npm run railway:touch-api`
Expected: migration SQL created and `.railway-redeploy` updated.

- [ ] **Step 6: Run Prisma generate and schema checks**

Run: `npm run generate --workspace @earlycv/database`
Expected: PASS and Prisma client types include new models/enums.

- [ ] **Step 7: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations apps/api/.railway-redeploy
git commit -m "feat(database): add manual ingestion batch run models"
```

### Task 2: Add API DTOs/types/repository helpers for manual batch runs

**Files:**
- Create: `apps/api/src/ingestion/dto/start-manual-adapter-run.dto.ts`
- Create: `apps/api/src/ingestion/dto/list-manual-runs.dto.ts`
- Create: `apps/api/src/ingestion/dto/list-manual-run-items.dto.ts`
- Create: `apps/api/src/ingestion/manual-ingestion-batch.repository.ts`
- Modify: `apps/api/src/database/database.service.ts`

- [ ] **Step 1: Write failing unit test for repository create/list/cancel behavior**

```ts
test("repository creates adapter batch with queued items", async () => {
  const result = await repo.createAdapterBatchRun({
    adapterType: "gupy",
    requestedByUserId: "admin-1",
  });
  assert.equal(result.status, "queued");
  assert.ok(result.totalSources >= 0);
});
```

- [ ] **Step 2: Run targeted test to verify failure**

Run: `npm run test --workspace apps/api -- src/ingestion/manual-ingestion-batch.repository.spec.ts`
Expected: FAIL with module/file not found.

- [ ] **Step 3: Implement DTOs with explicit validation constraints**

```ts
export class ListManualRunsDto {
  @IsOptional()
  @IsEnum(["queued", "running", "completed", "failed", "cancelling", "cancelled"])
  status?: string;

  @IsOptional()
  @IsEnum(["adapter", "source", "global"])
  scopeType?: string;
}
```

- [ ] **Step 4: Implement repository methods for create/list/detail/items/cancel-mark**

```ts
async markCancelRequested(batchRunId: string) {
  return this.database.ingestionBatchRun.update({
    where: { id: batchRunId },
    data: {
      status: "cancelling",
      cancelRequestedAt: new Date(),
    },
  });
}
```

- [ ] **Step 5: Run new repository test**

Run: `npm run test --workspace apps/api -- src/ingestion/manual-ingestion-batch.repository.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/ingestion/dto apps/api/src/ingestion/manual-ingestion-batch.repository.ts apps/api/src/database/database.service.ts apps/api/src/ingestion/manual-ingestion-batch.repository.spec.ts
git commit -m "feat(api): add manual ingestion batch repository and DTOs"
```

### Task 3: Implement background runner service for queued manual batches

**Files:**
- Create: `apps/api/src/ingestion/ingestion-manual-runner.service.ts`
- Modify: `apps/api/src/ingestion/ingestion.module.ts`
- Modify: `apps/api/src/ingestion/ingestion-lock.repository.ts`
- Test: `apps/api/src/ingestion/ingestion-manual-runner.service.spec.ts`

- [ ] **Step 1: Write failing runner test for sequential processing + counter updates**

```ts
test("runner processes queued adapter batch sequentially", async () => {
  await runner.tick();
  const run = await repo.getById(batchRunId);
  assert.equal(run?.status, "completed");
  assert.equal(run?.succeededCount, 2);
});
```

- [ ] **Step 2: Run runner test and capture failure**

Run: `npm run test --workspace apps/api -- src/ingestion/ingestion-manual-runner.service.spec.ts`
Expected: FAIL with missing service.

- [ ] **Step 3: Implement runner cron tick with test env guard and lock ownership**

```ts
@Cron("*/10 * * * * *")
async tick() {
  if (process.env.NODE_ENV === "test") return;
  await this.processNextBatchRun();
}
```

- [ ] **Step 4: Implement per-item loop with cancellation checkpoint before each next item**

```ts
if (run.cancelRequestedAt) {
  await this.repository.cancelRemainingItems(run.id);
  await this.repository.finishAsCancelled(run.id);
  return;
}
```

- [ ] **Step 5: Implement item execution using existing ingestion service and source lock**

```ts
await this.ingestionService.runJobSource(item.jobSourceId);
await this.repository.markItemCompleted(item.id);
```

- [ ] **Step 6: Run runner tests**

Run: `npm run test --workspace apps/api -- src/ingestion/ingestion-manual-runner.service.spec.ts`
Expected: PASS for complete/failed/cancelled transitions.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/ingestion/ingestion-manual-runner.service.ts apps/api/src/ingestion/ingestion.module.ts apps/api/src/ingestion/ingestion-lock.repository.ts apps/api/src/ingestion/ingestion-manual-runner.service.spec.ts
git commit -m "feat(api): add background runner for manual ingestion batches"
```

### Task 4: Add admin endpoints for start/list/detail/items/cancel manual runs

**Files:**
- Modify: `apps/api/src/ingestion/ingestion.controller.ts`
- Create: `apps/api/src/ingestion/manual-ingestion.service.ts`
- Modify: `apps/api/src/ingestion/ingestion.module.ts`
- Test: `apps/api/src/ingestion/ingestion.controller.spec.ts`

- [ ] **Step 1: Write failing controller integration tests for new routes**

```ts
test("POST /api/runs/manual/adapter/:adapterType enqueues batch and returns 202", async () => {
  const response = await request(app.getHttpServer())
    .post("/api/runs/manual/adapter/gupy")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(202);
  assert.equal(response.body.status, "queued");
});
```

- [ ] **Step 2: Run controller integration tests to verify failure**

Run: `npm run test --workspace apps/api -- src/ingestion/ingestion.controller.spec.ts`
Expected: FAIL 404 for new routes.

- [ ] **Step 3: Implement manual ingestion service orchestration**

```ts
async startAdapterRun(adapterType: JobSourceType, requestedByUserId: string) {
  return this.batchRepository.createAdapterBatchRun({ adapterType, requestedByUserId });
}
```

- [ ] **Step 4: Add controller routes with validation and `@HttpCode(202)` start route**

```ts
@Post("manual/adapter/:adapterType")
@HttpCode(202)
startManualAdapterRun(@Param("adapterType") adapterType: string, @Req() req: RequestWithUser) {
  return this.manualIngestionService.startAdapterRun(adapterType as JobSourceType, req.user.id);
}
```

- [ ] **Step 5: Add list/detail/items/cancel endpoints**

```ts
@Post("manual/:batchRunId/cancel")
cancelManualRun(@Param("batchRunId") batchRunId: string) {
  return this.manualIngestionService.cancel(batchRunId);
}
```

- [ ] **Step 6: Run API endpoint tests**

Run: `npm run test --workspace apps/api -- src/ingestion/ingestion.controller.spec.ts`
Expected: PASS for admin, reject non-admin.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/ingestion/ingestion.controller.ts apps/api/src/ingestion/manual-ingestion.service.ts apps/api/src/ingestion/ingestion.module.ts apps/api/src/ingestion/ingestion.controller.spec.ts
git commit -m "feat(api): expose manual ingestion batch endpoints"
```

### Task 5: Add web API client and server actions for async adapter runs and cancel

**Files:**
- Modify: `apps/web/src/lib/admin-ingestion-api.ts`
- Modify: `apps/web/src/app/admin/ingestion/actions.ts`
- Test: `apps/web/src/lib/admin-ingestion-flow.spec.ts`

- [ ] **Step 1: Write failing web unit tests for new action intents (start adapter run, cancel run)**

```ts
test("start adapter run action redirects with queued message", async () => {
  const result = await startManualAdapterRunAction(formData);
  assert.equal(result.status, "queued");
});
```

- [ ] **Step 2: Run web spec to verify failure**

Run: `npm run test --workspace apps/web -- src/lib/admin-ingestion-flow.spec.ts`
Expected: FAIL with missing exports/actions.

- [ ] **Step 3: Add API client methods and types**

```ts
export async function startManualAdapterRun(adapterType: "gupy" | "custom_html" | "custom_api") {
  return ingestRequest<{ batchRunId: string; status: string }>(`/api/runs/manual/adapter/${adapterType}`, {
    method: "POST",
  });
}
```

- [ ] **Step 4: Add server actions for start and cancel with redirect messaging**

```ts
export async function cancelManualRunAction(formData: FormData) {
  const batchRunId = String(formData.get("batchRunId") ?? "").trim();
  await cancelManualRun(batchRunId);
  redirect(buildAdminRedirect("/admin/ingestion", "success", "Cancelamento solicitado."));
}
```

- [ ] **Step 5: Run updated web tests**

Run: `npm run test --workspace apps/web -- src/lib/admin-ingestion-flow.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/admin-ingestion-api.ts apps/web/src/app/admin/ingestion/actions.ts apps/web/src/lib/admin-ingestion-flow.spec.ts
git commit -m "feat(web): add actions for async adapter manual runs"
```

### Task 6: Update admin ingestion UI to trigger adapter runs and display batch logs

**Files:**
- Modify: `apps/web/src/app/admin/ingestion/page.tsx`
- Create: `apps/web/src/app/admin/ingestion/[batchRunId]/page.tsx`
- Modify: `apps/web/src/lib/admin-ingestion-api.ts`
- Test: `apps/web/src/lib/admin-ingestion-flow.spec.ts`

- [ ] **Step 1: Write failing UI-oriented unit assertions for data shaping helpers/state presence**

```ts
test("admin ingestion state includes manual batch runs section", () => {
  assert.equal(typeof model.manualRuns.length, "number");
});
```

- [ ] **Step 2: Run web specs to verify failure**

Run: `npm run test --workspace apps/web -- src/lib/admin-ingestion-flow.spec.ts`
Expected: FAIL with missing manual run state.

- [ ] **Step 3: Add adapter trigger controls and non-blocking submit forms on main page**

```tsx
<form action={startManualAdapterRunAction}>
  <input name="adapterType" type="hidden" value="gupy" />
  <button className={buttonVariants({ variant: "outline" })} type="submit">Rodar Gupy</button>
</form>
```

- [ ] **Step 4: Add "Execucoes manuais" list with status, counters, and cancel button**

```tsx
{manualRuns.map((run) => (
  <tr key={run.id}>
    <td>{run.scopeType}</td>
    <td>{run.scopeValue}</td>
    <td>{run.status}</td>
    <td>{run.succeededCount}/{run.totalSources}</td>
  </tr>
))}
```

- [ ] **Step 5: Create detail page for one batch run with item-level logs**

```tsx
const [run, items] = await Promise.all([
  getManualRunById(batchRunId),
  listManualRunItems(batchRunId),
]);
```

- [ ] **Step 6: Run web specs**

Run: `npm run test --workspace apps/web -- src/lib/admin-ingestion-flow.spec.ts`
Expected: PASS and no regressions.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/admin/ingestion/page.tsx apps/web/src/app/admin/ingestion/[batchRunId]/page.tsx apps/web/src/lib/admin-ingestion-api.ts apps/web/src/lib/admin-ingestion-flow.spec.ts
git commit -m "feat(web): add manual ingestion run log and cancel UI"
```

### Task 7: End-to-end verification and cleanup

**Files:**
- Modify (if needed): `apps/api/src/ingestion/*.spec.ts`
- Modify (if needed): `apps/web/src/lib/admin-ingestion-flow.spec.ts`
- Modify (if needed): `docs/runbook/` (only if operational behavior changed materially)

- [ ] **Step 1: Run targeted API tests for new ingestion manual batch behavior**

Run: `npm run test --workspace apps/api -- src/ingestion/global-scheduler-config.service.spec.ts src/ingestion/ingestion-manual-runner.service.spec.ts src/ingestion/ingestion.controller.spec.ts`
Expected: PASS.

- [ ] **Step 2: Run targeted web test**

Run: `npm run test --workspace apps/web -- src/lib/admin-ingestion-flow.spec.ts`
Expected: PASS.

- [ ] **Step 3: Run full monorepo tests**

Run: `npm run test`
Expected: PASS across API and web.

- [ ] **Step 4: Verify migration/deploy marker are included together**

Run: `git status --short`
Expected: migration + `apps/api/.railway-redeploy` present in same changeset.

- [ ] **Step 5: Final commit (if verification fixes were needed)**

```bash
git add -A
git commit -m "test: stabilize manual ingestion background job coverage"
```
