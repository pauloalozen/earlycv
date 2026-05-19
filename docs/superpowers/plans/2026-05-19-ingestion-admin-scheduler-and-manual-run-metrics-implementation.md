# Ingestion Admin Scheduler and Manual Run Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clear source-level scheduling controls in admin ingestion and make manual run summary always coherent with run items while hardening backend counter consistency.

**Architecture:** Keep UI/API contracts mostly intact. Web admin reads existing schedule fields from `JobSource`, adds source-level schedule editing action, and computes manual run summary from item statuses. API manual runner gets idempotency guards around item transitions so aggregate counters do not inflate under concurrency/cancel timing.

**Tech Stack:** Next.js App Router, TypeScript, NestJS, Prisma, Vitest/Node test runner

---

### Task 1: Add Source-Schedule UX in Source Detail Page

**Files:**
- Modify: `apps/web/src/app/admin/ingestion/[jobSourceId]/page.tsx`
- Modify: `apps/web/src/app/admin/ingestion/actions.ts`
- Test: `apps/web/src/app/admin/ingestion/page.tsx` (existing patterns) or closest ingestion action/page tests

- [ ] **Step 1: Write failing tests for schedule display/edit action**

Add tests that assert:
1) source detail shows schedule state (`Escalonado`/`Desligado`), cron and timezone; 2) submit action sends `scheduleEnabled` + `scheduleCron` and redirects with success banner.

```ts
// Pseudocode structure (use existing project test style)
test("source detail renders schedule state and cron", async () => {
  // mock getJobSource response with scheduleEnabled true and cron
  // render page
  // assert visible: "Agendamento", "Escalonado", "*/30 * * * *", "America/Sao_Paulo"
});

test("update schedule action persists toggle and cron", async () => {
  // build FormData with jobSourceId, scheduleEnabled, scheduleCron, redirectPath
  // mock admin api update call
  // execute action and assert redirect success message
});
```

- [ ] **Step 2: Run the targeted web tests and confirm they fail**

Run: `npm run test --workspace @earlycv/web -- ingestion`
Expected: failures for missing schedule card/action wiring.

- [ ] **Step 3: Implement source detail schedule card and action**

In `apps/web/src/app/admin/ingestion/[jobSourceId]/page.tsx`:
- add `Agendamento` card with status/copy:
  - `Escalonado` when `source.scheduleEnabled && source.scheduleCron`
  - else `Desligado`
- add form posting to new `updateJobSourceScheduleAction`.

In `apps/web/src/app/admin/ingestion/actions.ts`:
- add server action that reads:
  - `jobSourceId`
  - `scheduleEnabled` (checkbox)
  - `scheduleCron`
  - `redirectPath`
- call existing ingestion admin API function for job source update (or create one if missing) with only schedule fields.

```ts
const scheduleEnabled = formData.get("scheduleEnabled") === "on";
const scheduleCronRaw = String(formData.get("scheduleCron") ?? "").trim();

const payload = scheduleEnabled
  ? { scheduleEnabled: true, scheduleCron: scheduleCronRaw || "*/30 * * * *", scheduleTimezone: "America/Sao_Paulo" }
  : { scheduleEnabled: false, scheduleCron: null };
```

- [ ] **Step 4: Run targeted web tests to confirm pass**

Run: `npm run test --workspace @earlycv/web -- ingestion`
Expected: schedule-related tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/web/src/app/admin/ingestion/[jobSourceId]/page.tsx apps/web/src/app/admin/ingestion/actions.ts
git commit -m "feat(admin-ingestion): add source schedule visibility and toggle"
```

### Task 2: Add Schedule Signal to Sources Table

**Files:**
- Modify: `apps/web/src/app/admin/ingestion/page.tsx`
- Test: `apps/web/src/app/admin/ingestion/page.tsx` related tests/snapshots if present

- [ ] **Step 1: Write failing test for `Fontes` table schedule column**

Add a test asserting table shows:
- `ligado` + cron snippet for enabled sources
- `desligado` for disabled sources.

```ts
test("sources table shows schedule status", async () => {
  // mock listJobSources with mixed scheduleEnabled values
  // render tab=fontes
  // assert schedule column values
});
```

- [ ] **Step 2: Run targeted test and confirm fail**

Run: `npm run test --workspace @earlycv/web -- ingestion`
Expected: missing column assertion fails.

- [ ] **Step 3: Implement schedule column in `Fontes` table**

In `apps/web/src/app/admin/ingestion/page.tsx`:
- add `Agendamento` header.
- render per source:
  - `ligado` + cron text when enabled;
  - `desligado` otherwise.

- [ ] **Step 4: Re-run targeted web tests**

Run: `npm run test --workspace @earlycv/web -- ingestion`
Expected: tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/web/src/app/admin/ingestion/page.tsx
git commit -m "feat(admin-ingestion): surface schedule state in sources list"
```

### Task 3: Recompute Manual Run Summary from Items in UI

**Files:**
- Modify: `apps/web/src/app/admin/ingestion/manual/[batchRunId]/page.tsx`
- Test: `apps/web/src/app/admin/ingestion/manual/[batchRunId]/page.tsx` tests (create if missing)

- [ ] **Step 1: Write failing test for coherent summary from item statuses**

Add a test with mismatched run counters and item statuses; assert UI summary follows items.

```ts
test("manual run summary is derived from items", async () => {
  // run: totalSources=68, succeededCount=264, failedCount=2, skippedCount=82
  // items: 60 completed, 2 failed, 6 skipped, 0 cancelled
  // assert displayed values: Total 68, Sucesso 60, Falha 2, Skip 6
});
```

- [ ] **Step 2: Run test and confirm fail**

Run: `npm run test --workspace @earlycv/web -- manual`
Expected: current UI still reads run counters.

- [ ] **Step 3: Implement derived counters and helper copy**

In `apps/web/src/app/admin/ingestion/manual/[batchRunId]/page.tsx`:
- compute counts from `items`.
- map `cancelled` into `Skip`.
- keep helper text: `Calculado a partir dos itens do lote`.

```ts
const summary = items.reduce(
  (acc, item) => {
    acc.total += 1;
    if (item.status === "completed") acc.succeeded += 1;
    else if (item.status === "failed") acc.failed += 1;
    else if (item.status === "skipped" || item.status === "cancelled") acc.skipped += 1;
    return acc;
  },
  { total: 0, succeeded: 0, failed: 0, skipped: 0 },
);
```

- [ ] **Step 4: Re-run manual page tests**

Run: `npm run test --workspace @earlycv/web -- manual`
Expected: pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/web/src/app/admin/ingestion/manual/[batchRunId]/page.tsx
git commit -m "fix(admin-ingestion): derive manual run summary from run items"
```

### Task 4: Harden Manual Runner Counter Idempotency

**Files:**
- Modify: `apps/api/src/ingestion/ingestion-manual-runner.service.ts`
- Modify/Test: `apps/api/src/ingestion/ingestion-manual-runner.service.spec.ts`

- [ ] **Step 1: Write failing API tests for duplicate increment/race protection**

Add tests asserting:
1) item finalization increments exactly once,
2) no counter growth beyond `totalSources`,
3) cancellation path does not double-count skipped/cancelled.

```ts
test("runner does not increment counters twice for same item", async () => {
  // simulate status changed before final update
  // expect no extra increment
});

test("aggregate counters never exceed totalSources", async () => {
  // crafted run state near total boundary
  // expect final counters clamped/guarded
});
```

- [ ] **Step 2: Run targeted API tests and confirm fail**

Run: `npm run test --workspace @earlycv/api -- ingestion-manual-runner`
Expected: failures on new assertions.

- [ ] **Step 3: Implement guarded state transitions and increments**

In `apps/api/src/ingestion/ingestion-manual-runner.service.ts`:
- before processing each item, refetch current row and skip if already terminal.
- replace unconditional updates with guarded `updateMany` by status set to ensure transition occurs once.
- increment counters only when guarded update result `count === 1`.
- at finalize, compute or enforce `succeeded+failed+skipped <= totalSources`.

```ts
const completeUpdate = await this.database.ingestionBatchItem.updateMany({
  where: { id: item.id, status: { in: ["queued", "running"] } },
  data: { status: "completed", finishedAt: new Date(), errorMessage: null },
});

if (completeUpdate.count === 1) {
  await this.database.ingestionBatchRun.update({
    where: { id: batchRunId },
    data: { succeededCount: { increment: 1 } },
  });
}
```

- [ ] **Step 4: Run targeted API tests to confirm pass**

Run: `npm run test --workspace @earlycv/api -- ingestion-manual-runner`
Expected: pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/api/src/ingestion/ingestion-manual-runner.service.ts apps/api/src/ingestion/ingestion-manual-runner.service.spec.ts
git commit -m "fix(ingestion): harden manual runner counters against double counting"
```

### Task 5: Extend Admin Ingestion API Client for Schedule Update (if needed)

**Files:**
- Modify: `apps/web/src/lib/admin-ingestion-api.ts`
- Test: `apps/web/src/lib/admin-ingestion-flow.spec.ts` or corresponding ingestion API tests

- [ ] **Step 1: Write failing test for schedule update request**

Add test asserting PATCH/PUT request for job source schedule payload fields.

```ts
test("updateJobSource sends schedule fields", async () => {
  // mock fetch and assert body contains scheduleEnabled/scheduleCron/scheduleTimezone
});
```

- [ ] **Step 2: Run targeted test and confirm fail**

Run: `npm run test --workspace @earlycv/web -- admin-ingestion`
Expected: missing helper/function fails.

- [ ] **Step 3: Implement minimal client function**

In `apps/web/src/lib/admin-ingestion-api.ts`, add function like:

```ts
export async function updateJobSource(
  jobSourceId: string,
  payload: Partial<Pick<JobSourceRecord, "scheduleEnabled" | "scheduleCron" | "scheduleTimezone">>,
  token?: string,
) {
  return apiRequest<JobSourceRecord>(`/job-sources/${jobSourceId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
```

- [ ] **Step 4: Re-run targeted test**

Run: `npm run test --workspace @earlycv/web -- admin-ingestion`
Expected: pass.

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/web/src/lib/admin-ingestion-api.ts
git commit -m "feat(admin-ingestion): add job source schedule update client"
```

### Task 6: Full Verification on Impacted Scope

**Files:**
- No code changes expected

- [ ] **Step 1: Run web checks for impacted area**

Run: `npm run check --workspace @earlycv/web`
Expected: no type/lint violations.

- [ ] **Step 2: Run api checks for impacted area**

Run: `npm run check --workspace @earlycv/api`
Expected: no type/lint violations.

- [ ] **Step 3: Run required repo verification commands**

Run:

```bash
npm run check
npm run generate --workspace @earlycv/database
npm run build
npm run test
```

Expected: all pass.

- [ ] **Step 4: Commit verification/logical final adjustments**

```bash
git add -A
git commit -m "chore(ingestion): finalize admin scheduler and run metrics consistency"
```

## Spec Coverage Check

- Source-level schedule visibility and control: covered in Tasks 1 and 2.
- Coherent manual run summary from items: covered in Task 3.
- Runner hardening to mitigate inflated counters: covered in Task 4.
- Contract wiring for updates in web client/actions: covered in Task 5.
- Validation and repository-level checks: covered in Task 6.

## Placeholder Scan

- No `TODO`/`TBD` placeholders included.
- All tasks include explicit files, commands, and expected outcomes.

## Type/Name Consistency Check

- Uses existing naming from codebase: `scheduleEnabled`, `scheduleCron`, `scheduleTimezone`, `succeededCount`, `failedCount`, `skippedCount`.
- Status values aligned with existing union types (`completed`, `failed`, `skipped`, `cancelled`).
