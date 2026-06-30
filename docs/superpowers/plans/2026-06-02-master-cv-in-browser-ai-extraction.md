# Master CV In-Browser AI Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Master CV extraction synchronously on upload, sending the raw file to the AI and returning partial extraction state to the dashboard UI.

**Architecture:** Reuse the existing protected upload patterns from `/adaptar`, but redirect the Master CV path to the canonical extraction service instead of the current heuristic text parser. The API will validate the upload, call AI with the file payload in the same request, persist the extraction snapshot, and merge allowed canonical fields into `userProfile`.

**Tech Stack:** NestJS, Prisma, Next.js App Router, TypeScript, existing analysis-protection facade, existing `packages/ai` prompt contract.

---

### Task 1: Add API contract for protected master CV upload

**Files:**
- Modify: `apps/api/src/resumes/resumes.controller.ts`
- Modify: `apps/api/src/resumes/dto/create-resume.dto.ts`
- Modify: `apps/api/src/resumes/resumes.service.ts`
- Modify: `apps/api/src/resumes/resumes.service.spec.ts`
- Modify: `apps/api/src/resumes/resumes.e2e-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("create requires turnstile and accepts file upload for protected master CV extraction", async () => {
  // Arrange a master upload request with file + turnstileToken.
  // Assert the API rejects missing/invalid protection input and accepts the valid path.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace apps/api -- src/resumes/resumes.service.spec.ts`
Expected: FAIL because the current upload path does not enforce the new protected contract for master CV extraction.

- [ ] **Step 3: Write minimal implementation**

```ts
// In CreateResumeDto, add turnstileToken?: string;
// In controller/service, keep multipart upload but pass token into the extraction flow.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace apps/api -- src/resumes/resumes.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/resumes/resumes.controller.ts apps/api/src/resumes/dto/create-resume.dto.ts apps/api/src/resumes/resumes.service.ts apps/api/src/resumes/resumes.service.spec.ts apps/api/src/resumes/resumes.e2e-spec.ts
git commit -m "feat: protect master cv upload"
```

### Task 2: Replace heuristic master CV merge with synchronous AI extraction

**Files:**
- Modify: `apps/api/src/resumes/resumes.service.ts`
- Modify: `apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.service.ts`
- Modify: `apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.types.ts`
- Modify: `apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.service.spec.ts`
- Modify: `packages/ai/src/master-cv-canonical-extraction.ts`
- Modify: `packages/ai/src/master-cv-canonical-extraction.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("processJob can extract canonical profile from raw file payload", async () => {
  // Provide a mock file payload and expect the AI extraction path to be called.
  // Assert canonicalJson and merged userProfile updates are produced.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace apps/api -- src/master-cv-canonical-extraction/master-cv-canonical-extraction.service.spec.ts`
Expected: FAIL because the service still expects plain text.

- [ ] **Step 3: Write minimal implementation**

```ts
// Change extraction input to a file payload object.
// Update the AI prompt helper to accept buffer + metadata instead of masterCvText.
// Keep merge rules and persistence unchanged.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace apps/api -- src/master-cv-canonical-extraction/master-cv-canonical-extraction.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/resumes/resumes.service.ts apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.service.ts apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.types.ts apps/api/src/master-cv-canonical-extraction/master-cv-canonical-extraction.service.spec.ts packages/ai/src/master-cv-canonical-extraction.ts packages/ai/src/master-cv-canonical-extraction.spec.ts
git commit -m "feat: extract master cv from file payload"
```

### Task 3: Persist and return extraction status for dashboard UX

**Files:**
- Modify: `apps/api/src/resumes/resumes.controller.ts`
- Modify: `apps/api/src/resumes/resumes.service.ts`
- Modify: `apps/api/src/resumes/dto/master-cv-extraction-status.dto.ts`
- Modify: `apps/api/src/resumes/resumes.master-cv-extraction-status.e2e-spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("uploading a master CV returns extraction coverage for the dashboard", async () => {
  // Assert the response exposes status, extractionCoverage, and updatedAt.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace apps/api -- src/resumes/resumes.master-cv-extraction-status.e2e-spec.ts`
Expected: FAIL until the upload path returns the extraction snapshot consistently.

- [ ] **Step 3: Write minimal implementation**

```ts
// Keep the existing status DTO.
// Ensure the upload request updates MasterCvCanonicalExtraction and userProfile before returning.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace apps/api -- src/resumes/resumes.master-cv-extraction-status.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/resumes/resumes.controller.ts apps/api/src/resumes/resumes.service.ts apps/api/src/resumes/dto/master-cv-extraction-status.dto.ts apps/api/src/resumes/resumes.master-cv-extraction-status.e2e-spec.ts
git commit -m "feat: return master cv extraction status"
```

### Task 4: Update dashboard client to rely on the synchronous extraction response

**Files:**
- Modify: `apps/web/src/app/dashboard/cv-master-card.tsx`
- Modify: `apps/web/src/lib/resumes-api.ts`
- Modify: `apps/web/src/lib/resumes-api.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("uploadMasterResume handles extraction response payload for dashboard", async () => {
  // Assert the client does not assume a null-only response and can use status data.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/resumes-api.spec.ts`
Expected: FAIL if the helper cannot consume the richer synchronous response.

- [ ] **Step 3: Write minimal implementation**

```ts
// Preserve empty-body tolerance.
// Extend the helper return type if the API begins returning structured extraction state.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/resumes-api.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/cv-master-card.tsx apps/web/src/lib/resumes-api.ts apps/web/src/lib/resumes-api.spec.ts
git commit -m "feat: consume master cv extraction response"
```

### Task 5: Verify end-to-end behavior

**Files:**
- No new files expected.

- [ ] **Step 1: Run API checks and tests**

Run: `npm run check --workspace apps/api && npm run build --workspace apps/api && npm test --workspace apps/api`
Expected: PASS.

- [ ] **Step 2: Run web checks and tests**

Run: `npm run check --workspace apps/web && npm run build --workspace apps/web && npm test --workspace apps/web`
Expected: PASS, with any pre-existing warnings called out separately.

- [ ] **Step 3: Inspect the dashboard flow manually**

Run the app, upload a master CV, and confirm the dashboard shows extracted fields and missing fields immediately after upload.
