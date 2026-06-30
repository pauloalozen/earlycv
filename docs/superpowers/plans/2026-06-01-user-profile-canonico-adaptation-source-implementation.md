# UserProfile Canonico + Adaptation Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement canonical UserProfile data flow with explicit adaptation source/input mode, immutable analysis/generation snapshots, and safe merge behavior that protects manual edits.

**Architecture:** Extend existing Prisma models (`UserProfile`, `CvAdaptation`) with JSON-backed canonical structures and metadata, then centralize merge logic in API domain services used by `/cv-adaptation` and `/cv-base` flows. Web app keeps 3 adaptation options (file/text/profile), gates profile mode by readiness, and sends explicit source metadata. Snapshots captured at analysis and generation boundaries ensure historical auditability.

**Tech Stack:** NestJS, Prisma, TypeScript, Next.js App Router, Vitest/Jest e2e/unit tests

---

## File map and responsibilities

**Database schema**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_user_profile_canonico/migration.sql`

**API domain and DTOs**
- Modify: `apps/api/src/cv-adaptation/dto/create-cv-adaptation.dto.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.controller.ts`
- Modify: `apps/api/src/profiles/dto/update-profile.dto.ts`
- Modify: `apps/api/src/profiles/profiles.service.ts`
- Create: `apps/api/src/profiles/profile-canonical.types.ts`
- Create: `apps/api/src/profiles/profile-readiness.service.ts`
- Create: `apps/api/src/profiles/profile-canonical-merge.service.ts`

**API tests**
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.spec.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts`
- Modify: `apps/api/src/profiles/profiles.e2e-spec.ts`
- Create: `apps/api/src/profiles/profile-canonical-merge.service.spec.ts`

**Web app**
- Modify: `apps/web/src/lib/cv-adaptation-api.ts`
- Modify: `apps/web/src/app/adaptar/page.tsx`
- Modify: `apps/web/src/app/adaptar/page.submit-flow.spec.tsx`
- Modify: `apps/web/src/app/adaptar/page.selector.test.tsx`
- Modify: `apps/web/src/app/cv-base/page.tsx`

**Docs/ops**
- Modify: `docs/runbook/` (add short operational note for new profile snapshot/suggestions handling)

---

### Task 1: Add canonical profile + adaptation source schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_user_profile_canonico/migration.sql`

- [ ] **Step 1: Write failing schema expectations in API test**

Add a failing expectation in `apps/api/src/profiles/profiles.e2e-spec.ts` for new fields (example):

```ts
expect(profile).toMatchObject({
  profileReadinessStatus: "empty",
  experiencesJson: expect.anything(),
  profileFieldMetaJson: expect.anything(),
  profileSuggestionsJson: expect.anything(),
});
```

- [ ] **Step 2: Run targeted test to confirm failure**

Run: `npm run test --workspace @earlycv/api -- profiles.e2e-spec.ts`
Expected: FAIL on missing fields/type mismatch.

- [ ] **Step 3: Update Prisma schema**

Add enums and fields (shape example):

```prisma
enum CvAdaptationSource {
  uploaded_content
  user_profile
}

enum CvAdaptationInputMode {
  file_upload
  text_paste
  profile
}

enum ProfileReadinessStatus {
  empty
  partial
  ready
}

model UserProfile {
  // existing fields...
  fullName                 String?
  phone                    String?
  linkedinUrl              String?
  professionalSummary      String?
  experiencesJson          Json?
  educationJson            Json?
  skillsJson               Json?
  languagesJson            Json?
  certificationsJson       Json?
  profileFieldMetaJson     Json?
  profileSuggestionsJson   Json?
  profileReadinessStatus   ProfileReadinessStatus @default(empty)
}

model CvAdaptation {
  // existing fields...
  adaptationSource         CvAdaptationSource @default(uploaded_content)
  inputMode                CvAdaptationInputMode @default(file_upload)
  userProfileSnapshotJson  Json?
  uploadedContentSnapshotJson Json?
  analysisInputSnapshotJson Json?
  generationInputSnapshotJson Json?
}
```

- [ ] **Step 4: Generate migration + client**

Run: `npm run generate --workspace @earlycv/database`
Expected: PASS with Prisma client regenerated.

- [ ] **Step 5: Add migration touch for Railway**

Run: `npm run railway:touch-api`
Expected: timestamp update in `apps/api/.railway-redeploy`.

- [ ] **Step 6: Re-run targeted failing test**

Run: `npm run test --workspace @earlycv/api -- profiles.e2e-spec.ts`
Expected: still FAIL until API mappings are implemented (schema no longer the blocker).

- [ ] **Step 7: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations apps/api/.railway-redeploy
git commit -m "feat(database): add canonical profile and adaptation source fields"
```

---

### Task 2: Introduce canonical profile types + readiness calculation

**Files:**
- Create: `apps/api/src/profiles/profile-canonical.types.ts`
- Create: `apps/api/src/profiles/profile-readiness.service.ts`
- Test: `apps/api/src/profiles/profile-canonical-merge.service.spec.ts`

- [ ] **Step 1: Write failing readiness tests**

```ts
test("returns ready only with minimum required fields", () => {
  expect(service.compute({ experiences: [{ id: "exp_1" }], skills: { technical: ["SQL"] }, fullName: "A" })).toBe("ready");
});

test("returns partial with some curriculum data but below threshold", () => {
  expect(service.compute({ experiences: [], skills: { technical: ["SQL"] } })).toBe("partial");
});

test("returns empty when no useful curriculum data", () => {
  expect(service.compute({ experiences: [], education: [], skills: { technical: [], business: [], soft: [] } })).toBe("empty");
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `npm run test --workspace @earlycv/api -- profile-canonical-merge.service.spec.ts`
Expected: FAIL due to missing readiness service.

- [ ] **Step 3: Implement types + service**

Implement stable-id item contracts and `fieldPath` helpers:

```ts
export type ProfileExperience = {
  id: string;
  company?: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  achievements?: string[];
  relatedSkills?: string[];
};

export type ProfileFieldPath = string; // e.g. experiences.exp_123.role
```

Readiness rules in service:

```ts
const hasExperience = experiences.length > 0;
const hasSkill = skills.technical.length + skills.business.length + skills.soft.length > 0;
const hasIdentity = Boolean(fullName || headline || professionalSummary);

if (!hasExperience && !hasSkill && !hasIdentity) return "empty";
if (hasExperience && hasSkill && hasIdentity) return "ready";
return "partial";
```

- [ ] **Step 4: Re-run readiness tests**

Run: `npm run test --workspace @earlycv/api -- profile-canonical-merge.service.spec.ts`
Expected: PASS for readiness cases.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/profiles/profile-canonical.types.ts apps/api/src/profiles/profile-readiness.service.ts apps/api/src/profiles/profile-canonical-merge.service.spec.ts
git commit -m "feat(api): add canonical profile types and readiness rules"
```

---

### Task 3: Implement centralized canonical merge service

**Files:**
- Create: `apps/api/src/profiles/profile-canonical-merge.service.ts`
- Modify: `apps/api/src/profiles/profiles.service.ts`
- Test: `apps/api/src/profiles/profile-canonical-merge.service.spec.ts`

- [ ] **Step 1: Add failing merge tests for manual protection and suggestions**

```ts
test("does not overwrite manually edited field and creates pending suggestion", () => {
  const result = mergeService.merge({
    existing: profileWithManualPhone,
    incoming: { phone: "+55 11 99999-0000" },
    source: "base_cv_upload",
  });
  expect(result.next.phone).toBe(profileWithManualPhone.phone);
  expect(result.suggestions.some((s) => s.fieldPath === "phone" && s.status === "pending")).toBe(true);
});

test("uses stable id paths after experience reorder", () => {
  const result = mergeService.merge({ existing, incoming, source: "analysis_upload" });
  expect(result.fieldMeta["experiences.exp_abc.role"]).toBeDefined();
});
```

- [ ] **Step 2: Run merge tests to confirm failure**

Run: `npm run test --workspace @earlycv/api -- profile-canonical-merge.service.spec.ts`
Expected: FAIL missing service behavior.

- [ ] **Step 3: Implement merge rules in one service**

Core merge signature:

```ts
merge(input: {
  existing: CanonicalProfileData;
  incoming: CanonicalProfileData;
  source: "analysis_upload" | "base_cv_upload" | "manual_edit";
  sourceCvId?: string | null;
}): MergeResult
```

Key behaviors:
- normalize phone/linkedin before compare;
- fill empty automatically;
- allow `base_cv_upload` to update auto-extracted fields;
- protect `manuallyEdited=true`;
- persist `profileSuggestionsJson` entries with `pending|accepted|rejected`;
- no delete on absent incoming;
- skills dedupe/normalize.

- [ ] **Step 4: Wire service into `ProfilesService.update` for manual metadata**

On manual update (`PUT /users/profile`):
- mark touched `fieldPath`s with `source=manual_edit`, `manuallyEdited=true`, `lastEditedAt`.

- [ ] **Step 5: Re-run merge/profile tests**

Run: `npm run test --workspace @earlycv/api -- profile-canonical-merge.service.spec.ts profiles.e2e-spec.ts`
Expected: PASS for merge protection and metadata persistence.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/profiles/profile-canonical-merge.service.ts apps/api/src/profiles/profiles.service.ts apps/api/src/profiles/profile-canonical-merge.service.spec.ts apps/api/src/profiles/profiles.e2e-spec.ts
git commit -m "feat(api): add centralized canonical profile merge service"
```

---

### Task 4: Add source/input mode to cv-adaptation API contract

**Files:**
- Modify: `apps/api/src/cv-adaptation/dto/create-cv-adaptation.dto.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.controller.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
- Test: `apps/api/src/cv-adaptation/cv-adaptation.service.spec.ts`

- [ ] **Step 1: Add failing tests for source/input behavior**

```ts
test("rejects profile mode when file or text is provided", async () => {
  await expect(service.create(userId, { inputMode: "profile", jobDescriptionText: "..." }, file)).rejects.toThrow(BadRequestException);
});

test("rejects profile mode when readiness is not ready", async () => {
  await expect(service.create(userId, { inputMode: "profile", jobDescriptionText: "..." })).rejects.toThrow("Perfil salvo ainda não está pronto");
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `npm run test --workspace @earlycv/api -- cv-adaptation.service.spec.ts`
Expected: FAIL with missing DTO/service validations.

- [ ] **Step 3: Extend DTO and infer adaptation source**

```ts
@IsOptional()
@IsEnum(["file_upload", "text_paste", "profile"])
inputMode?: "file_upload" | "text_paste" | "profile";
```

In service:

```ts
const inputMode = dto.inputMode ?? (file ? "file_upload" : dto.masterCvText ? "text_paste" : "profile");
const adaptationSource = inputMode === "profile" ? "user_profile" : "uploaded_content";
```

Enforce:
- `profile` mode cannot carry file/text payload;
- `profile` mode requires readiness `ready`;
- no silent fallback to old CV when not ready.

- [ ] **Step 4: Persist mode/source in `CvAdaptation` create**

```ts
await this.database.cvAdaptation.create({
  data: {
    ...,
    inputMode,
    adaptationSource,
  },
});
```

- [ ] **Step 5: Re-run adaptation unit tests**

Run: `npm run test --workspace @earlycv/api -- cv-adaptation.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cv-adaptation/dto/create-cv-adaptation.dto.ts apps/api/src/cv-adaptation/cv-adaptation.controller.ts apps/api/src/cv-adaptation/cv-adaptation.service.ts apps/api/src/cv-adaptation/cv-adaptation.service.spec.ts
git commit -m "feat(api): persist adaptation source and input mode"
```

---

### Task 5: Capture analysis/generation snapshots with size-safe strategy

**Files:**
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
- Test: `apps/api/src/cv-adaptation/cv-adaptation.service.spec.ts`

- [ ] **Step 1: Add failing snapshot immutability tests**

```ts
test("stores analysis and generation snapshots separately", async () => {
  const adaptation = await createAndGenerate();
  expect(adaptation.analysisInputSnapshotJson).toBeTruthy();
  expect(adaptation.generationInputSnapshotJson).toBeTruthy();
  expect(adaptation.analysisInputSnapshotJson).not.toEqual(adaptation.generationInputSnapshotJson);
});

test("snapshot remains unchanged after profile edit", async () => {
  const before = adaptation.generationInputSnapshotJson;
  await profilesService.update(userId, { headline: "changed" });
  const after = await db.cvAdaptation.findUnique({ where: { id: adaptation.id } });
  expect(after?.generationInputSnapshotJson).toEqual(before);
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npm run test --workspace @earlycv/api -- cv-adaptation.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement snapshot builders**

Snapshot content guidelines:
- include `resumeId` when available;
- include `contentSha256`;
- include structured extracted input;
- include final resolved generation input;
- avoid full raw text duplication if reference+hash is sufficient.

Pseudo-structure:

```ts
type AnalysisInputSnapshot = {
  adaptationSource: "uploaded_content" | "user_profile";
  inputMode: "file_upload" | "text_paste" | "profile";
  resumeRef?: { resumeId: string };
  contentSha256: string;
  structuredInput: Record<string, unknown>;
};
```

- [ ] **Step 4: Persist snapshots at correct boundaries**

- analysis start/complete: write `analysisInputSnapshotJson`;
- generation path (pdf/docx): resolve final source priorities and write `generationInputSnapshotJson` once if absent.

- [ ] **Step 5: Re-run snapshot tests**

Run: `npm run test --workspace @earlycv/api -- cv-adaptation.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cv-adaptation/cv-adaptation.service.ts apps/api/src/cv-adaptation/cv-adaptation.service.spec.ts
git commit -m "feat(api): add immutable analysis and generation snapshots"
```

---

### Task 6: Integrate canonical merge into analysis upload/text and cv-base update

**Files:**
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
- Modify: `apps/api/src/profiles/profiles.module.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.module.ts`
- Test: `apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts`

- [ ] **Step 1: Add failing e2e tests for upload/text behavior**

```ts
test("text_paste mode treats pasted content as primary and only complements profile", async () => {
  // prepare existing profile with manual phone
  // submit text mode adaptation
  // assert profile phone unchanged and adaptation source persisted
});
```

- [ ] **Step 2: Run e2e tests to confirm failure**

Run: `npm run test --workspace @earlycv/api -- cv-adaptation.e2e-spec.ts`
Expected: FAIL on missing integration.

- [ ] **Step 3: Call merge service from adaptation flows**

In upload/text analysis flow:
- extract canonical candidate data from uploaded content result;
- merge with source `analysis_upload`.

In CV base upload flow:
- merge with source `base_cv_upload` and stronger update rules for auto-extracted fields.

- [ ] **Step 4: Recompute and persist readiness status after merge**

```ts
const readiness = this.profileReadinessService.compute(nextProfileData);
```

- [ ] **Step 5: Re-run e2e tests**

Run: `npm run test --workspace @earlycv/api -- cv-adaptation.e2e-spec.ts profiles.e2e-spec.ts`
Expected: PASS for profile completion/protection flows.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cv-adaptation/cv-adaptation.service.ts apps/api/src/cv-adaptation/cv-adaptation.module.ts apps/api/src/profiles/profiles.module.ts apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts
git commit -m "feat(api): merge canonical profile from adaptation and cv-base flows"
```

---

### Task 7: Web flow updates for 3 modes + readiness gating

**Files:**
- Modify: `apps/web/src/lib/cv-adaptation-api.ts`
- Modify: `apps/web/src/app/adaptar/page.tsx`
- Modify: `apps/web/src/app/adaptar/page.submit-flow.spec.tsx`
- Modify: `apps/web/src/app/adaptar/page.selector.test.tsx`

- [ ] **Step 1: Write failing UI tests for profile mode gating**

```ts
it("disables profile mode when readiness is not ready", async () => {
  // mock profile readiness partial
  // expect profile option disabled/hidden
});

it("sends inputMode=text_paste for text flow", async () => {
  // submit text mode
  // inspect formData includes inputMode=text_paste
});
```

- [ ] **Step 2: Run web tests to confirm failure**

Run: `npm run test --workspace @earlycv/web -- page.submit-flow.spec.tsx`
Expected: FAIL.

- [ ] **Step 3: Update API client payloads**

Add `inputMode` propagation in `cv-adaptation-api.ts` request builders.

- [ ] **Step 4: Update `/adaptar` UI logic**

- keep 3 options;
- file => `inputMode=file_upload`;
- text => `inputMode=text_paste`;
- profile => `inputMode=profile` only when readiness ready;
- show clear message if not ready.

- [ ] **Step 5: Re-run selector/submit tests**

Run: `npm run test --workspace @earlycv/web -- page.selector.test.tsx page.submit-flow.spec.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/cv-adaptation-api.ts apps/web/src/app/adaptar/page.tsx apps/web/src/app/adaptar/page.selector.test.tsx apps/web/src/app/adaptar/page.submit-flow.spec.tsx
git commit -m "feat(web): keep 3 adapt modes with readiness-gated profile mode"
```

---

### Task 8: CV Base page feedback for canonical update summary

**Files:**
- Modify: `apps/web/src/app/cv-base/page.tsx`

- [ ] **Step 1: Add failing UI assertion**

Add test/expectation (if page tests exist; otherwise add minimal unit around response mapper) for summary text:

```ts
expect(screen.getByText(/Atualizamos seu perfil com base no CV enviado/i)).toBeInTheDocument();
```

- [ ] **Step 2: Implement non-blocking summary UI**

Display:
- added count;
- updated count;
- pending review count.

- [ ] **Step 3: Validate manually in dev**

Run: `npm run dev --workspace @earlycv/web`
Expected: CV Base upload shows optional update summary and continues flow.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/cv-base/page.tsx
git commit -m "feat(web): show canonical profile update summary after cv-base upload"
```

---

### Task 9: Full verification and documentation note

**Files:**
- Modify/Create: `docs/runbook/<new-note>.md`

- [ ] **Step 1: Add operational note**

Document:
- meaning of `adaptationSource` and `inputMode`;
- readiness gating behavior;
- snapshot audit fields;
- where suggestions are persisted.

- [ ] **Step 2: Run required project verification**

Run (from repo root):

```bash
npm run check
npm run generate --workspace @earlycv/database
npm run build
npm run test
```

Expected: all commands PASS.

- [ ] **Step 3: Commit docs and fixes**

```bash
git add docs/runbook
git commit -m "docs(runbook): add canonical profile and adaptation source operations"
```

---

## Plan self-review

### Spec coverage check
- `adaptationSource` vs `inputMode`: covered in Task 1 + Task 4 + Task 7.
- `profileReadinessStatus` objective and gating ready-only: covered in Task 2 + Task 4 + Task 7.
- stable `fieldPath` with item `id`: covered in Task 2 + Task 3.
- persistent suggestions/conflicts (`pending/accepted/rejected`): covered in Task 3.
- separate analysis vs generation audit snapshots: covered in Task 1 + Task 5.
- no ambiguous fallback in profile mode: covered in Task 4.
- text paste same semantics as file upload: covered in Task 6 + Task 7.
- LGPD/export-delete awareness: runbook note in Task 9 (and implementation hooks expected in existing account deletion/export services).
- no phase-1 backfill: explicitly deferred; no tasks include backfill job.

### Placeholder scan
- No TODO/TBD placeholders included.
- Every task includes concrete files and executable commands.

### Type consistency check
- Enum names used consistently: `uploaded_content|user_profile`, `file_upload|text_paste|profile`.
- Readiness statuses consistent: `empty|partial|ready`.
- Snapshot names consistent: `analysisInputSnapshotJson` and `generationInputSnapshotJson`.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-01-user-profile-canonico-adaptation-source-implementation.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
