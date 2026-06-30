# Master CV Canonical Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a dedicated, async AI pipeline that extracts complete canonical profile data from Master CV uploads, reports extraction coverage (`filled`/`partial`/`missing`), and never blocks user analysis flow.

**Architecture:** Add a new API slice for master CV canonical extraction with queue-backed async processing, strict schema validation, and conservative merge into `userProfile`. Keep existing analysis and CV generation prompts unchanged by introducing a separate prompt module in `packages/ai`. Persist extraction status/coverage for UI feedback after upload.

**Tech Stack:** NestJS, Prisma, TypeScript, Node test runner, OpenAI client via `@earlycv/ai`, queue package (`@earlycv/queue`), existing profile merge/readiness services.

---

### Task 1: Add database model for extraction job state and UX payload

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_add_master_cv_canonical_extraction/migration.sql`
- Modify: `packages/database/src/schema.spec.ts`

- [ ] **Step 1: Write failing schema tests for new model and indexes**

Add assertions in `packages/database/src/schema.spec.ts` for:
- model `MasterCvCanonicalExtraction`
- enum `MasterCvCanonicalExtractionStatus` with `pending|processing|succeeded|failed`
- unique constraint for `(resumeId, inputHash)`
- columns `coverageJson`, `confidenceJson`, `evidenceJson`

- [ ] **Step 2: Run schema tests and confirm failure**

Run: `npm run test --workspace @earlycv/database -- src/schema.spec.ts`
Expected: FAIL (new model missing)

- [ ] **Step 3: Implement Prisma schema changes**

Add enum + model with fields from spec:
- ids, foreign keys, status, attempts, lastError
- `canonicalJson`, `coverageJson`, `confidenceJson`, `evidenceJson`
- timestamps and required indexes

- [ ] **Step 4: Create migration SQL**

Create migration file mirroring the Prisma schema additions.

- [ ] **Step 5: Regenerate Prisma client and rerun tests**

Run: `npm run generate --workspace @earlycv/database && npm run test --workspace @earlycv/database -- src/schema.spec.ts`
Expected: PASS

---

### Task 2: Add dedicated AI prompt module for canonical extraction

**Files:**
- Create: `packages/ai/src/master-cv-canonical-extraction.ts`
- Create: `packages/ai/src/master-cv-canonical-extraction.spec.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: Write failing tests for strict output contract**

Create `packages/ai/src/master-cv-canonical-extraction.spec.ts` with tests:
- returns structured `canonicalProfile`
- returns `extractionCoverage.fieldStatus` values in `filled|partial|missing`
- rejects malformed JSON or invalid status values

- [ ] **Step 2: Run AI package tests and confirm failure**

Run: `npm run test --workspace @earlycv/ai -- src/master-cv-canonical-extraction.spec.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement prompt module**

In `packages/ai/src/master-cv-canonical-extraction.ts` implement:
- input type: `{ masterCvText: string; locale?: string }`
- output type per approved spec (full canonical + coverage + confidence + evidence)
- system prompt with hard guardrails (no invention, evidence-based extraction)
- OpenAI call + JSON parse + runtime shape validation

- [ ] **Step 4: Export module from package index**

Update `packages/ai/src/index.ts` to export new function and types.

- [ ] **Step 5: Run tests for `@earlycv/ai`**

Run: `npm run test --workspace @earlycv/ai`
Expected: PASS

---

### Task 3: Create API extraction slice (module, service, schema)

**Files:**
- Create: `apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.module.ts`
- Create: `apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.service.ts`
- Create: `apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.schema.ts`
- Create: `apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.types.ts`
- Create: `apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing service tests**

Cover:
- idempotent enqueue by `resumeId + inputHash`
- schema validation failure -> mark `failed`
- successful extraction -> persisted payload + merge invoked

- [ ] **Step 2: Run API unit test and confirm failure**

Run: `npm run test --workspace @earlycv/api -- src/master-cv-canonical-extraction/master-cv-canonical-extraction.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implement runtime schema and types**

Implement strict runtime validator for extraction payload (including `fieldStatus` values and required top-level keys).

- [ ] **Step 4: Implement service behavior**

Service methods:
- `enqueueFromMasterResumeUpload({ userId, resumeId, rawText })`
- `processJob({ extractionId })`
- `getLatestByUserId(userId)` for UI status

Rules:
- compute `inputHash`
- idempotent create/reuse
- call new `@earlycv/ai` function
- persist coverage/confidence/evidence
- invoke merge pipeline

- [ ] **Step 5: Wire module into app**

Register module/providers in `AppModule` following existing module conventions.

- [ ] **Step 6: Run target tests**

Run: `npm run test --workspace @earlycv/api -- src/master-cv-canonical-extraction/master-cv-canonical-extraction.service.spec.ts`
Expected: PASS

---

### Task 4: Integrate with Master CV upload flow (non-blocking)

**Files:**
- Modify: `apps/api/src/resumes/resumes.service.ts`
- Modify: `apps/api/src/resumes/resumes.service.spec.ts`

- [ ] **Step 1: Write failing tests in resumes service**

Cases:
- on master CV upload with extracted `rawText`, enqueue extraction job
- upload response does not fail when enqueue/process trigger fails
- fallback behavior remains (resume saved regardless)

- [ ] **Step 2: Run resumes tests and confirm failure**

Run: `npm run test --workspace @earlycv/api -- src/resumes/resumes.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implement upload integration**

In `create(...)`:
- after transaction success for master resume + rawText, trigger enqueue method
- wrap enqueue call in safe error boundary (log and continue)
- keep existing synchronous heuristic merge temporarily (or behind flag) until rollout confirms extraction quality

- [ ] **Step 4: Re-run resumes tests**

Run: `npm run test --workspace @earlycv/api -- src/resumes/resumes.service.spec.ts`
Expected: PASS

---

### Task 5: Expose extraction coverage to frontend

**Files:**
- Create: `apps/api/src/resumes/dto/master-cv-extraction-status.dto.ts`
- Modify: `apps/api/src/resumes/resumes.controller.ts`
- Modify: `apps/api/src/resumes/resumes.service.ts`
- Modify: `apps/api/src/resumes/resumes.e2e-spec.ts`
- Modify: `apps/web/src/lib/resumes-api.ts`
- Modify: `apps/web/src/app/adaptar/page.tsx`
- Modify: `apps/web/src/app/adaptar/page.submit-flow.spec.tsx`

- [ ] **Step 1: Write failing API e2e test for status endpoint**

Add endpoint test for e.g. `GET /resumes/master-cv-extraction-status` returning:
- `status`
- `extractionCoverage` object when available
- `updatedAt`

- [ ] **Step 2: Implement API endpoint and DTO**

Return latest extraction row for current user mapped to UI contract.

- [ ] **Step 3: Write failing web test for post-upload feedback rendering**

Test that UI can show:
- extracted fields list
- missing fields list
- manual-completion CTA copy

- [ ] **Step 4: Implement web data fetch + rendering**

Use existing `/adaptar` loading lifecycle to fetch extraction status and render concise feedback box.

- [ ] **Step 5: Run API and web tests**

Run:
- `npm run test --workspace @earlycv/api -- src/resumes/resumes.e2e-spec.ts`
- `npm run test:ui --workspace @earlycv/web -- src/app/adaptar/page.submit-flow.spec.tsx`
Expected: PASS

---

### Task 6: Queue worker, retries, and observability

**Files:**
- Create: `apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.worker.ts`
- Modify: `apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.module.ts`
- Modify: `apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.service.spec.ts`
- Modify: `docs/runbook/` (new runbook file)

- [ ] **Step 1: Write failing worker/retry tests**

Cases:
- retries transient failures up to max attempts
- marks permanent failures
- logs key metadata (`resumeId`, `userId`, `inputHash`)

- [ ] **Step 2: Implement worker and retry policy**

Implement queue consumer with bounded retries and status transitions.

- [ ] **Step 3: Add operational runbook**

Create `docs/runbook/master-cv-canonical-extraction-operational-runbook.md` with:
- backlog checks
- retry/poison message procedures
- feature-flag rollback steps
- direct production rollback steps (no feature flag)

- [ ] **Step 4: Run worker-related tests**

Run: `npm run test --workspace @earlycv/api -- src/master-cv-canonical-extraction/master-cv-canonical-extraction.service.spec.ts`
Expected: PASS

---

### Task 7: Direct rollout and cleanup gates

**Files:**
- Modify: rollout notes and operational docs
- Modify: `docs/superpowers/specs/2026-06-01-master-cv-canonical-extraction-design.md` (only if final deltas emerge)

- [ ] **Step 1: Validate direct production rollout checklist**

Confirm runbook includes:
- queue pause/resume procedure
- rollback by deploy reversion (no feature flag)

- [ ] **Step 2: Confirm no feature-flag gating in code paths**

Ensure upload enqueue path and worker execution are always active by design.

- [ ] **Step 3: Run targeted tests**

Run impacted API tests.
Expected: PASS

---

### Task 8: Final verification before merge

**Files:**
- Modify: any touched files from previous tasks

- [ ] **Step 1: Run impacted quality checks first**

Run:
- `npm run check --workspace @earlycv/api`
- `npm run check --workspace @earlycv/web`
- `npm run test --workspace @earlycv/api`
- `npm run test --workspace @earlycv/web`

- [ ] **Step 2: Run required repo-level verification from AGENTS.md**

Run:
- `npm run check`
- `npm run generate --workspace @earlycv/database`
- `npm run build`
- `npm run test`

- [ ] **Step 3: Validate non-regression of analysis/generation prompts**

Confirm no modifications in existing adaptation prompt files/modules; only new dedicated extraction prompt added.

- [ ] **Step 4: Prepare commit sequence**

Suggested commit breakdown:
1. `feat(database): add master cv canonical extraction state model`
2. `feat(ai): add dedicated master cv canonical extraction prompt`
3. `feat(api): add extraction pipeline and upload integration`
4. `feat(web): show extracted vs missing canonical fields`
5. `docs(runbook): add master cv extraction operations guide`
