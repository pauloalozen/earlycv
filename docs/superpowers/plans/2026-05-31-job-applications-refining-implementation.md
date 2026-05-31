# Job Applications Refining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement archive/restore for job applications as a visibility dimension (active vs archived), preserving status semantics and access to historical CV assets.

**Architecture:** Add `archivedAt` and `deletedAt` to `JobApplication`, then thread visibility through API list/highlights/query rules and new archive/restore endpoints. Keep detail/download access for archived applications, and update web routes (`/candidaturas` and `/candidaturas/[id]`) to support an `Arquivadas` segment with restore UX.

**Tech Stack:** Next.js App Router, NestJS, Prisma, TypeScript, Vitest/Node test runner, Biome.

---

### Task 1: Add visibility columns to database model

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_job_application_archive_soft_delete/migration.sql`
- Modify: `apps/api/.railway-redeploy`

- [ ] **Step 1: Add nullable fields in Prisma model**

Add to `JobApplication` model:
- `archivedAt DateTime?`
- `deletedAt DateTime?`

- [ ] **Step 2: Generate migration file locally (create-only)**

Run:
`npx prisma migrate dev --name job_application_archive_soft_delete --create-only --schema packages/database/prisma/schema.prisma`

This creates the SQL from the schema diff without applying it.
Do not hand-write the SQL.
Do not run migrate deploy locally — the API start script (`npm run deploy --workspace @earlycv/database`) applies migrations on deploy.
Verify the generated SQL adds only the two nullable columns (`archivedAt`, `deletedAt`), with no backfill or data rewrite.

- [ ] **Step 3: Touch Railway redeploy marker**

Run:
`npm run railway:touch-api`

- [ ] **Step 4: Verify generated artifacts**

Confirm:
- schema contains both fields
- migration only adds nullable columns
- `apps/api/.railway-redeploy` updated


### Task 2: Extend API contract for active/archived scopes

**Files:**
- Modify: `apps/api/src/job-applications/dto/list-job-applications.dto.ts`
- Modify: `apps/api/src/job-applications/job-applications.controller.ts`
- Modify: `apps/api/src/job-applications/job-applications.service.ts`
- Test: `apps/api/src/job-applications/job-applications.service.spec.ts`
- Test: `apps/api/src/job-applications/job-applications.controller.spec.ts`

- [ ] **Step 1: Add `archived` query param to DTO**

In list DTO, add optional boolean parsing for `archived` with default `false`.

- [ ] **Step 2: Wire controller list to pass archived scope**

Update `GET /job-applications` controller to pass `query.archived ?? false` into service.

- [ ] **Step 3: Apply visibility rules in service list/highlights**

Implement where clauses:
- Active list (`archived=false`): `archivedAt: null` and `deletedAt: null`
- Archived list (`archived=true`): `archivedAt: { not: null }` and `deletedAt: null`
- Highlights: always active-only (`archivedAt: null`, `deletedAt: null`)
- Status filters stay applied inside selected scope.

- [ ] **Step 4: Treat deleted records as hidden in all user-facing queries**

Guarantee `deletedAt != null` is excluded from list/highlights/detail reads.

- [ ] **Step 5: Add/adjust tests for scope behavior**

Cover:
- archived=false excludes archived/deleted
- archived=true includes archived only
- status filters work in both scopes
- highlights never include archived/deleted


### Task 3: Implement archive and restore endpoints

**Files:**
- Modify: `apps/api/src/job-applications/job-applications.controller.ts`
- Modify: `apps/api/src/job-applications/job-applications.service.ts`
- Test: `apps/api/src/job-applications/job-applications.service.spec.ts`
- Test: `apps/api/src/job-applications/job-applications.controller.spec.ts`

- [ ] **Step 1: Add controller routes**

Add:
- `POST /job-applications/:id/archive`
- `POST /job-applications/:id/restore`

- [ ] **Step 2: Implement service archive logic**

Archive behavior:
- ownership check by `userId`
- if already archived: no-op success
- else set `archivedAt = now()`
- never mutate status

- [ ] **Step 3: Implement service restore logic**

Restore behavior:
- ownership check by `userId`
- if already active: no-op success
- else set `archivedAt = null`
- never mutate status

- [ ] **Step 4: Enforce deleted-as-not-found behavior**

For archive/restore/detail by user, `deletedAt != null` should be treated as not found.

- [ ] **Step 5: Add tests**

Cover:
- archive transition + idempotency
- restore transition + idempotency
- ownership enforcement
- status unchanged after archive/restore
- status changed while archived persists after restore (e.g., set INTERVIEW while archived, restore, status remains INTERVIEW)


### Task 4: Add API client calls and route updates on web

**Files:**
- Modify: `apps/web/src/lib/job-applications-api.ts`
- Test: `apps/web/src/app/candidaturas/candidaturas.test.tsx`
- Test: `apps/web/src/app/candidaturas/[id]/detail-client.test.tsx`

- [ ] **Step 1: Extend list API client with `archived` arg**

Update `listJobApplications` to send `archived` query parameter.

- [ ] **Step 2: Add archive/restore client helpers**

Implement:
- `archiveJobApplication(id)` -> POST `/:id/archive`
- `restoreJobApplication(id)` -> POST `/:id/restore`

- [ ] **Step 3: Add robust error parsing**

Mirror existing style (status + API message) for actionable toast copy.


### Task 5: Implement archived segment in list page (`/candidaturas`)

**Files:**
- Modify: `apps/web/src/app/candidaturas/page.tsx`
- Modify: `apps/web/src/app/candidaturas/candidaturas-client.tsx`
- Test: `apps/web/src/app/candidaturas/candidaturas.test.tsx`
- Modify (if needed): `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Fetch active pipeline by default**

Keep default load scoped to active applications only (`archived=false`).

- [ ] **Step 2: Add Arquivadas entry point as separate segment**

In client state, add explicit segment toggle `ativas` vs `arquivadas` (not mixed into status filters).

- [ ] **Step 3: Load archived segment data**

When user switches to `Arquivadas`, fetch list with `archived=true` and render same cards.

- [ ] **Step 4: Ensure archived cards expose Restore primary action**

Primary CTA in archived segment should call restore and then refresh/remove from archived list.

- [ ] **Step 5: Ensure no archive action appears on list cards**

List cards remain focused on contextual CTA + download behavior.

- [ ] **Step 6: Verify dashboard summary exclusion**

Ensure top-3 summary on dashboard still reflects active-only data path.


### Task 6: Implement archive/restore on detail page (`/candidaturas/[id]`)

**Files:**
- Modify: `apps/web/src/app/candidaturas/[id]/detail-client.tsx`
- Test: `apps/web/src/app/candidaturas/[id]/detail-client.test.tsx`

- [ ] **Step 1: Add Arquivar action on active detail**

Expose archive action only on detail page for active application.

- [ ] **Step 2: Add Restaurar action on archived detail**

Expose restore action when detail is archived.

- [ ] **Step 3: Handle post-action navigation**

On archive, navigate to archived view in `/candidaturas`.
On restore, navigate back to active view.

- [ ] **Step 4: Preserve access to downloads and analysis actions**

Archived detail must keep CV download/review actions enabled.


### Task 7: Verification and final consistency checks

**Files:**
- Modify: `apps/web/src/components/app-header.tsx` (only if labels/links need copy updates)
- Verify: no user-facing route remains under `/dashboard/candidaturas`

- [ ] **Step 1: Run impacted API tests**

Run:
`npm run test --workspace @earlycv/api -- src/job-applications/job-applications.service.spec.ts src/job-applications/job-applications.controller.spec.ts`

- [ ] **Step 2: Run impacted web tests**

Run:
`npx vitest run src/app/candidaturas/candidaturas.test.tsx "src/app/candidaturas/[id]/detail-client.test.tsx" src/app/dashboard/history-action-links.test.tsx src/lib/cv-unlock-flow.test.ts`

- [ ] **Step 3: Run required repo verification commands**

Run:
`npm run check`

Run:
`npm run generate --workspace @earlycv/database`

Run:
`npm run build`

Run:
`npm run test`

- [ ] **Step 4: Manual smoke checklist**

Validate in browser:
- `/candidaturas` defaults to active
- `Arquivadas` shows archived only
- archive from detail removes from active and appears archived
- restore reverses behavior
- archived cards/details still allow CV download and analysis review
- no user-facing delete action anywhere

- [ ] **Step 5: Legacy route reference audit**

Confirm no internal links or routes still reference the legacy `/dashboard/candidaturas` path (routes are now `/candidaturas` and `/candidaturas/[id]`).

---

## Spec Coverage Check

- Data model with `archivedAt` + `deletedAt`: covered by Task 1.
- Visibility rules active/archived/deleted: covered by Tasks 2 and 3.
- API query param `archived` and highlights behavior: covered by Task 2.
- Archive/restore endpoints with idempotency + ownership: covered by Task 3.
- Web segmentation and detail actions: covered by Tasks 5 and 6.
- Dashboard summary exclusion: covered by Task 5.
- Tests requested by spec: covered by Tasks 2, 3, 5, 6, and 7.
