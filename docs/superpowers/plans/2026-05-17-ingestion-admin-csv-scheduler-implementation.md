# Ingestion Admin CSV + Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV onboarding with dry-run, deterministic dedupe, URL canonicalization, persistent scheduler locking, and admin controls for source/global scheduling and deletions.

**Architecture:** Extend existing ingestion/admin modules incrementally. Reuse `Company`, `JobSource`, and `IngestionRun`, add minimal schedule/lock/config persistence, and centralize CSV orchestration in ingestion service layer. Keep UI changes inside existing admin ingestion pages.

**Tech Stack:** NestJS, Prisma, Next.js App Router, TypeScript, Vitest/Jest-style tests already used in repo.

---

### Task 1: Schema evolution for schedule, fallback flag, and persistent lock

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_ingestion_scheduler_csv_controls/migration.sql`
- Modify: `apps/api/.env.example` (if new env defaults are needed)

- [ ] **Step 1: Write failing API tests for missing persistence fields**

```ts
test("job source stores schedule and fallback flag", async () => {
  const source = await database.jobSource.create({
    data: {
      companyId,
      sourceName: "Career",
      sourceType: "custom_html",
      sourceUrl: "https://example.com/careers",
      parserKey: "custom_html",
      crawlStrategy: "html",
      checkIntervalMinutes: 30,
      scheduleEnabled: true,
      scheduleCron: "*/30 * * * *",
      scheduleTimezone: "America/Sao_Paulo",
      isFallbackAdapter: true,
    },
  });

  expect(source.scheduleEnabled).toBe(true);
  expect(source.isFallbackAdapter).toBe(true);
});
```

- [ ] **Step 2: Run targeted test and verify failure**

Run: `npm run test --workspace apps/api -- job-sources`
Expected: FAIL with Prisma unknown field errors.

- [ ] **Step 3: Add minimal Prisma fields/tables**

```prisma
model JobSource {
  // existing fields...
  scheduleEnabled   Boolean @default(false)
  scheduleCron      String?
  scheduleTimezone  String  @default("America/Sao_Paulo")
  isFallbackAdapter Boolean @default(false)
}

model IngestionSchedulerConfig {
  id            String  @id @default("global")
  enabled       Boolean @default(false)
  globalCron    String?
  timezone      String  @default("America/Sao_Paulo")
  normalDelayMs Int     @default(45000)
  errorDelayMs  Int     @default(90000)
  updatedAt     DateTime @updatedAt
  createdAt     DateTime @default(now())
}

model IngestionSchedulerLock {
  id         String   @id
  lockedAt   DateTime
  expiresAt  DateTime
  owner      String
  updatedAt  DateTime @updatedAt
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 4: Run Prisma generate/migrate**

Run: `npm run prisma:migrate --workspace packages/database -- --name ingestion_scheduler_csv_controls`
Expected: migration created and client regenerated.

- [ ] **Step 5: Commit schema migration**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations apps/api/.env.example
git commit -m "feat(database): add ingestion scheduler and fallback persistence"
```

### Task 2: Deterministic normalization and URL canonicalization utilities

**Files:**
- Modify: `apps/api/src/companies/companies.service.ts`
- Create: `apps/api/src/ingestion/url-normalization.ts`
- Create: `apps/api/src/ingestion/name-normalization.ts`
- Test: `apps/api/src/ingestion/url-normalization.spec.ts`
- Test: `apps/api/src/ingestion/name-normalization.spec.ts`

- [ ] **Step 1: Write failing normalization tests**

```ts
test("normalizes company names deterministically", () => {
  expect(normalizeCompanyName("  ÁCME   Labs ")).toBe("acme-labs");
  expect(normalizeCompanyName("ACME Labs")).toBe("acme-labs");
});

test("canonicalizes source urls", () => {
  expect(canonicalizeSourceUrl("HTTPS://Example.com/careers/?a=1#top")).toBe(
    "https://example.com/careers",
  );
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test --workspace apps/api -- ingestion/url-normalization`
Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement utility modules and wire company service**

```ts
export function normalizeCompanyName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

```ts
export function canonicalizeSourceUrl(raw: string) {
  const url = new URL(raw.trim());
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test --workspace apps/api -- ingestion/name-normalization ingestion/url-normalization`
Expected: PASS.

- [ ] **Step 5: Commit utility layer**

```bash
git add apps/api/src/companies/companies.service.ts apps/api/src/ingestion/name-normalization.ts apps/api/src/ingestion/url-normalization.ts apps/api/src/ingestion/*.spec.ts
git commit -m "feat(api): add deterministic normalization and source url canonicalization"
```

### Task 3: CSV import service with dry-run and fallback semantics

**Files:**
- Create: `apps/api/src/ingestion/admin-ingestion-import.service.ts`
- Create: `apps/api/src/ingestion/dto/import-company-sources-csv.dto.ts`
- Modify: `apps/api/src/ingestion/ingestion.controller.ts`
- Modify: `apps/api/src/ingestion/ingestion.module.ts`
- Test: `apps/api/src/ingestion/admin-ingestion-import.service.spec.ts`

- [ ] **Step 1: Write failing tests for dry-run and persist modes**

```ts
test("dry-run validates and reports actions without persisting", async () => {
  const result = await service.importCsv({ csvText, dryRun: true });
  expect(result.summary.successCount).toBeGreaterThan(0);
  expect(await database.company.count()).toBe(0);
});

test("persist mode upserts company and source", async () => {
  const result = await service.importCsv({ csvText, dryRun: false });
  expect(result.summary.companiesCreated).toBe(1);
  expect(result.summary.sourcesCreated).toBe(1);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test --workspace apps/api -- admin-ingestion-import`
Expected: FAIL because service is missing.

- [ ] **Step 3: Implement import orchestration**

```ts
const inferred = careersUrl.toLowerCase().includes("gupy")
  ? { sourceType: "gupy", parserKey: "gupy", crawlStrategy: "api", isFallbackAdapter: false }
  : { sourceType: "custom_html", parserKey: "custom_html", crawlStrategy: "html", isFallbackAdapter: true };
```

```ts
if (dryRun) {
  // compute and report only
} else {
  // upsert company by normalizedName
  // upsert source by (companyId, canonicalSourceUrl)
}
```

- [ ] **Step 4: Expose multipart endpoint with `dryRun` flag**

Run: add `POST /runs/company-sources/import-csv` (or admin-prefixed route in ingestion controller) accepting file + `dryRun`.

- [ ] **Step 5: Run tests for import service and controller**

Run: `npm run test --workspace apps/api -- ingestion`
Expected: PASS for new import scenarios.

- [ ] **Step 6: Commit import feature**

```bash
git add apps/api/src/ingestion
git commit -m "feat(api): add csv import with dry-run and fallback adapter semantics"
```

### Task 4: Source update and delete compatibility

**Files:**
- Modify: `apps/api/src/job-sources/dto/update-job-source.dto.ts`
- Modify: `apps/api/src/job-sources/dto/create-job-source.dto.ts`
- Modify: `apps/api/src/job-sources/job-sources.service.ts`
- Test: `apps/api/src/job-sources/job-sources.e2e-spec.ts`

- [ ] **Step 1: Write failing tests for schedule/fallback fields through API**

```ts
expect(body.scheduleEnabled).toBe(true);
expect(body.scheduleCron).toBe("*/15 * * * *");
expect(body.isFallbackAdapter).toBe(true);
```

- [ ] **Step 2: Run e2e tests and verify failure**

Run: `npm run test:e2e --workspace apps/api -- job-sources`
Expected: FAIL with validation whitelist errors.

- [ ] **Step 3: Extend DTOs + service mapping**

```ts
@IsOptional() @IsBoolean() scheduleEnabled?: boolean;
@IsOptional() @IsString() scheduleCron?: string;
@IsOptional() @IsString() scheduleTimezone?: string;
@IsOptional() @IsBoolean() isFallbackAdapter?: boolean;
```

- [ ] **Step 4: Re-run e2e tests**

Run: `npm run test:e2e --workspace apps/api -- job-sources`
Expected: PASS.

- [ ] **Step 5: Commit DTO/service compatibility updates**

```bash
git add apps/api/src/job-sources
git commit -m "feat(api): extend job source dto for scheduling and fallback flags"
```

### Task 5: Persistent-lock scheduler runtime (source cron + global cron)

**Files:**
- Create: `apps/api/src/ingestion/ingestion-scheduler.service.ts`
- Create: `apps/api/src/ingestion/ingestion-lock.repository.ts`
- Create: `apps/api/src/ingestion/global-scheduler-config.service.ts`
- Modify: `apps/api/src/ingestion/ingestion.module.ts`
- Test: `apps/api/src/ingestion/ingestion-scheduler.service.spec.ts`

- [ ] **Step 1: Write failing tests for persistent lock behavior**

```ts
test("global scheduler skips when lock is held", async () => {
  await lockRepo.acquire("global-ingestion", "owner-a", 60_000);
  const result = await scheduler.runGlobalTick();
  expect(result.status).toBe("skipped_locked");
});
```

- [ ] **Step 2: Run scheduler tests and verify failure**

Run: `npm run test --workspace apps/api -- ingestion-scheduler`
Expected: FAIL because scheduler/lock modules do not exist.

- [ ] **Step 3: Implement DB-backed lock and sequential execution**

```ts
const acquired = await this.lockRepo.acquire("global-ingestion", owner, ttlMs);
if (!acquired) return { status: "skipped_locked" };
try {
  for (const source of orderedSources) {
    await this.ingestionService.runJobSource(source.id);
    await sleep(success ? normalDelayMs : errorDelayMs);
  }
} finally {
  await this.lockRepo.release("global-ingestion", owner);
}
```

- [ ] **Step 4: Wire cron ticks for source/global schedule**

Run: use `@nestjs/schedule` cron handlers that evaluate source/global configs in timezone `America/Sao_Paulo`.

- [ ] **Step 5: Run scheduler tests**

Run: `npm run test --workspace apps/api -- ingestion-scheduler`
Expected: PASS.

- [ ] **Step 6: Commit scheduler runtime**

```bash
git add apps/api/src/ingestion
git commit -m "feat(api): add db-locked ingestion scheduler with sequential global runs"
```

### Task 6: Admin API wiring for global scheduler config and enriched runs list

**Files:**
- Modify: `apps/api/src/ingestion/ingestion.controller.ts`
- Modify: `apps/api/src/ingestion/ingestion.service.ts`
- Test: `apps/api/src/job-sources/job-sources.e2e-spec.ts`

- [ ] **Step 1: Write failing e2e tests for global scheduler endpoints**

```ts
await request(server)
  .put("/api/runs/scheduler/global")
  .set("Authorization", `Bearer ${token}`)
  .send({ enabled: true, globalCron: "0 */2 * * *", normalDelayMs: 45000, errorDelayMs: 90000 })
  .expect(200);
```

- [ ] **Step 2: Run e2e and verify failure**

Run: `npm run test:e2e --workspace apps/api -- job-sources`
Expected: FAIL 404.

- [ ] **Step 3: Implement endpoints and payload validation**

```ts
@Get("scheduler/global")
getGlobalSchedulerConfig() { ... }

@Put("scheduler/global")
updateGlobalSchedulerConfig(@Body() dto: UpdateGlobalSchedulerDto) { ... }
```

- [ ] **Step 4: Enrich `GET /runs` projection with company/source context**

Run: include `jobSource` + `company` fields in response mapping for admin global table.

- [ ] **Step 5: Run e2e tests to pass**

Run: `npm run test:e2e --workspace apps/api -- job-sources`
Expected: PASS.

- [ ] **Step 6: Commit API wiring**

```bash
git add apps/api/src/ingestion apps/api/src/job-sources/job-sources.e2e-spec.ts
git commit -m "feat(api): expose global scheduler config and enriched runs list"
```

### Task 7: Admin web integration (CSV dry-run/import, scheduler forms, run table, deletions)

**Files:**
- Modify: `apps/web/src/lib/admin-ingestion-api.ts`
- Modify: `apps/web/src/lib/admin-ingestion-flow.ts`
- Modify: `apps/web/src/app/admin/ingestion/actions.ts`
- Modify: `apps/web/src/app/admin/ingestion/page.tsx`
- Modify: `apps/web/src/app/admin/ingestion/[jobSourceId]/page.tsx`
- Test: `apps/web/src/lib/admin-ingestion-flow.spec.ts`

- [ ] **Step 1: Write failing web/unit tests for new admin actions**

```ts
test("builds dry-run redirect with summary", () => {
  const path = buildAdminRedirect("/admin/ingestion", "success", "Dry-run concluido", { dryRun: "1" });
  expect(path).toContain("dryRun=1");
});
```

- [ ] **Step 2: Run web tests and verify failure**

Run: `npm run test --workspace apps/web -- admin-ingestion-flow`
Expected: FAIL due missing helpers/actions.

- [ ] **Step 3: Implement API clients and server actions**

```ts
export async function importCompanySourcesCsv(file: File, dryRun: boolean) { ... }
export async function updateGlobalSchedulerConfig(payload: ...) { ... }
export async function deleteCompany(companyId: string) { ... }
export async function deleteJobSource(jobSourceId: string) { ... }
```

- [ ] **Step 4: Update ingestion page UI sections**

Run: add cards for CSV dry-run/import, global scheduler form, global runs table, and delete controls with explicit confirmations.

- [ ] **Step 5: Run web tests to pass**

Run: `npm run test --workspace apps/web -- admin-ingestion-flow`
Expected: PASS.

- [ ] **Step 6: Commit web admin integration**

```bash
git add apps/web/src/app/admin/ingestion apps/web/src/lib/admin-ingestion-*.ts
git commit -m "feat(web): add csv dry-run/import and scheduler controls in ingestion admin"
```

### Task 8: End-to-end verification, docs alignment, and deploy hooks

**Files:**
- Modify: `docs/runbook/` (new scheduler/import operational guide)
- Modify: `docs/superpowers/specs/2026-05-17-ingestion-admin-csv-scheduler-design.md` (if implementation deltas)
- Modify: `apps/api/.railway-redeploy`

- [ ] **Step 1: Add operational runbook updates**

```md
- Como executar dry-run CSV
- Como promover para import persistente
- Como configurar cron por fonte
- Como configurar cron global e delays
- Como interpretar lock skip e falhas por fonte
```

- [ ] **Step 2: Run full targeted verification suite**

Run: `npm run test --workspace apps/api -- ingestion job-sources && npm run test:e2e --workspace apps/api -- job-sources && npm run test --workspace apps/web -- admin-ingestion-flow`
Expected: PASS.

- [ ] **Step 3: Touch Railway redeploy marker for migration rollout**

Run: `npm run railway:touch-api`
Expected: `apps/api/.railway-redeploy` updated timestamp.

- [ ] **Step 4: Final commit for docs + deployment marker**

```bash
git add docs/runbook docs/superpowers/specs/2026-05-17-ingestion-admin-csv-scheduler-design.md apps/api/.railway-redeploy
git commit -m "docs(api): add ingestion import/scheduler runbook and deploy marker"
```

## Spec-to-Plan Coverage Check

- CSV import + dry-run mode: covered in Task 3 and Task 7.
- Deterministic company normalization: covered in Task 2.
- Canonical source URL to prevent duplicates: covered in Task 2 and Task 3.
- Persistent DB lock for scheduler: covered in Task 1 and Task 5.
- `custom_html` fallback with explicit marker/operational validation: covered in Task 1, Task 3, Task 7, Task 8.
- Reuse existing models/screens with incremental changes: covered across Tasks 3-7.
- Delete source/company in admin: covered in Task 7 (UI) and existing API reuse.
