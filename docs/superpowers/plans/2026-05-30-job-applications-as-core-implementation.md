# Job Applications as Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition dashboard and applications UX around `JobApplication` as the central unit, with analysis access only through application detail, plus two backend behavior fixes (mandatory identity for persistence and manual analysis split).

**Architecture:** Keep Prisma schema unchanged and implement a read-model projection in API services that derives `bestScore`, `bestCvAdaptationId`, `bestCvState`, and `scorePresentation` from linked adaptations. Web consumes only application-centric endpoints for dashboard highlights and pipeline cards. Missing extraction does not block analysis delivery; it only delays application persistence until user provides title+company.

**Tech Stack:** NestJS, TypeScript, Prisma, Next.js App Router, React, node:test, Biome.

---

### Task 1: Add failing API tests for new read-model and mandatory identity behavior

**Files:**
- Modify: `apps/api/src/job-applications/job-applications.service.spec.ts`
- Modify: `apps/api/src/job-applications/job-applications.controller.spec.ts` (or equivalent listing controller test file)

- [ ] **Step 1: Add failing service test for missing title/company persistence rule**

```ts
test("upsertFromCvAdaptation does not create application when title/company are missing", async () => {
  await service.upsertFromCvAdaptation({
    userId: "user-1",
    cvAdaptationId: "adapt-1",
    jobTitle: null,
    companyName: null,
    targetStatus: "ANALYZED",
    origin: "optimized_cv_auto",
  });

  assert.equal(jobApplicationStore.length, 0);
  assert.equal(cvAdaptationStore[0]?.jobApplicationId ?? null, null);
});
```

- [ ] **Step 2: Add failing service test for tie-break (`CV_READY` wins on equal score)**

```ts
test("derives best adaptation preferring CV_READY when scores tie", async () => {
  const summary = deriveApplicationSummary([
    {
      id: "a1",
      createdAt: new Date("2026-05-01T10:00:00Z"),
      status: "ANALYZED",
      adaptedContentJson: { atsScore: { after: 82 } },
    },
    {
      id: "a2",
      createdAt: new Date("2026-05-02T10:00:00Z"),
      status: "CV_READY",
      adaptedContentJson: { atsScore: { after: 82 } },
    },
  ]);

  assert.equal(summary.bestCvAdaptationId, "a2");
  assert.equal(summary.bestScore, 82);
  assert.equal(summary.bestCvState, "ready");
});
```

- [ ] **Step 3: Add failing controller/list test for derived fields in list payload**

```ts
assert.deepEqual(Object.keys(response.items[0]).includes("bestScore"), true);
assert.deepEqual(Object.keys(response.items[0]).includes("bestCvAdaptationId"), true);
assert.deepEqual(Object.keys(response.items[0]).includes("bestCvState"), true);
assert.deepEqual(Object.keys(response.items[0]).includes("scorePresentation"), true);
```

- [ ] **Step 4: Run targeted API tests to confirm failure**

Run: `npm run test --workspace @earlycv/api -- src/job-applications/job-applications.service.spec.ts src/job-applications/job-applications.controller.spec.ts`
Expected: FAIL on missing derived fields / missing helper / behavior mismatch.

- [ ] **Step 5: Commit failing tests**

```bash
git add apps/api/src/job-applications/job-applications.service.spec.ts apps/api/src/job-applications/job-applications.controller.spec.ts
git commit -m "test(api/job-applications): cover read-model and mandatory identity rules"
```

### Task 2: Implement API read-model derivation and highlights endpoint

**Files:**
- Modify: `apps/api/src/job-applications/job-applications.service.ts`
- Modify: `apps/api/src/job-applications/job-applications.controller.ts`
- Modify: `apps/api/src/job-applications/dto/*.ts`

- [ ] **Step 1: Implement pure helper for summary derivation in service**

```ts
type DerivedSummary = {
  bestScore: number | null;
  bestCvAdaptationId: string | null;
  bestCvState: "ready" | "locked" | "missing";
  scorePresentation: "scored" | "not_analyzed";
};

function deriveSummaryFromAdaptations(adaptations: AdaptationView[]): DerivedSummary {
  const scored = adaptations
    .map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      scoreAfter: extractScoreAfterFromContent(a.adaptedContentJson),
      isReady: a.status === "CV_READY" || Boolean(a.adaptedResumeId),
      isUnlocked: a.status === "CV_READY" || a.status === "DELIVERED",
    }))
    .filter((a) => a.scoreAfter !== null) as Array<{
    id: string;
    createdAt: Date;
    scoreAfter: number;
    isReady: boolean;
    isUnlocked: boolean;
  }>;

  if (scored.length === 0) {
    return {
      bestScore: null,
      bestCvAdaptationId: null,
      bestCvState: "missing",
      scorePresentation: "not_analyzed",
    };
  }

  scored.sort((a, b) => {
    if (b.scoreAfter !== a.scoreAfter) return b.scoreAfter - a.scoreAfter;
    if (a.isReady !== b.isReady) return a.isReady ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const best = scored[0];
  return {
    bestScore: best.scoreAfter,
    bestCvAdaptationId: best.id,
    bestCvState: best.isUnlocked ? "ready" : "locked",
    scorePresentation: "scored",
  };
}
```

- [ ] **Step 2: Extend list mapping to include derived fields**

```ts
return applications.map((app) => {
  const derived = deriveSummaryFromAdaptations(app.cvAdaptations);
  return {
    ...toApplicationDto(app),
    bestScore: derived.bestScore,
    bestCvAdaptationId: derived.bestCvAdaptationId,
    bestCvState: derived.bestCvState,
    scorePresentation: derived.scorePresentation,
  };
});
```

- [ ] **Step 3: Add highlights service method with relevance ordering**

```ts
async listHighlights(userId: string, limit = 3) {
  const apps = await this.loadApplicationsWithAdaptations(userId);
  const ranked = apps
    .map((app) => ({ app, derived: deriveSummaryFromAdaptations(app.cvAdaptations) }))
    .sort(compareByRelevance)
    .slice(0, limit)
    .map(({ app, derived }) => ({ ...toApplicationDto(app), ...derived }));
  return ranked;
}
```

- [ ] **Step 4: Expose `GET /job-applications/highlights` in controller**

```ts
@Get("highlights")
listHighlights(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
  const parsed = Number.parseInt(limit ?? "3", 10);
  return this.jobApplicationsService.listHighlights(user.id, Number.isFinite(parsed) ? parsed : 3);
}
```

- [ ] **Step 5: Run targeted API tests**

Run: `npm run test --workspace @earlycv/api -- src/job-applications/job-applications.service.spec.ts src/job-applications/job-applications.controller.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit read-model and highlights**

```bash
git add apps/api/src/job-applications/job-applications.service.ts apps/api/src/job-applications/job-applications.controller.ts apps/api/src/job-applications/dto
git commit -m "feat(api/job-applications): add derived best-version fields and highlights endpoint"
```

### Task 3: Implement mandatory identity persistence flow (no placeholder creation)

**Files:**
- Modify: `apps/api/src/job-applications/job-applications.service.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.spec.ts`

- [ ] **Step 1: Add failing test for deferred persistence after manual identity input**

```ts
test("analysis result is delivered while application persistence waits for title/company", async () => {
  const result = await service.saveGuestPreview(inputWithoutTitleCompany);
  assert.equal(result.status, "ok");
  assert.equal(jobApplicationStore.length, 0);
});
```

- [ ] **Step 2: Implement `upsertFromCvAdaptation` guard as explicit non-persist branch with logging**

```ts
if (!jobTitle || !companyName) {
  this.logger.warn(`[job-applications] missing title/company for adaptation ${cvAdaptationId}; persistence deferred`);
  return;
}
```

- [ ] **Step 3: Add API path to persist application after manual title/company provided**

```ts
@Patch(":adaptationId/application-identity")
saveIdentity(@Param("adaptationId") adaptationId: string, @Body() dto: SaveIdentityDto, @CurrentUser() user: AuthUser) {
  return this.cvAdaptationService.persistApplicationIdentity(user.id, adaptationId, dto);
}
```

- [ ] **Step 4: Implement service method wiring to normal upsert flow**

```ts
await this.jobApplicationsService.upsertFromCvAdaptation({
  userId,
  cvAdaptationId: adaptation.id,
  jobTitle: dto.jobTitle.trim(),
  companyName: dto.companyName.trim(),
  jobDescriptionText: adaptation.jobDescriptionText,
  targetStatus: adaptation.status === "delivered" ? "CV_READY" : "ANALYZED",
  origin: "optimized_cv_auto",
});
```

- [ ] **Step 5: Run targeted tests for cv-adaptation + job-applications**

Run: `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.service.spec.ts src/job-applications/job-applications.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit mandatory identity flow**

```bash
git add apps/api/src/job-applications/job-applications.service.ts apps/api/src/cv-adaptation/cv-adaptation.service.ts apps/api/src/cv-adaptation/cv-adaptation.service.spec.ts
git commit -m "feat(api/cv-adaptation): defer application persistence until title and company are provided"
```

### Task 4: Add split-analysis endpoint and source/current pointer repoint logic

**Files:**
- Modify: `apps/api/src/job-applications/job-applications.controller.ts`
- Modify: `apps/api/src/job-applications/job-applications.service.ts`
- Modify: `apps/api/src/job-applications/job-applications.service.spec.ts`

- [ ] **Step 1: Add failing split tests (success + pointer repoint + null fallback)**

```ts
test("split repoints source currentCvAdaptationId when separated analysis was current", async () => {
  const out = await service.splitAnalysisIntoNewApplication("user-1", "app-1", "adapt-2");
  assert.equal(out.newApplicationId.length > 0, true);
  assert.equal(sourceApp.currentCvAdaptationId, "adapt-1");
  assert.equal(newApp.currentCvAdaptationId, "adapt-2");
});

test("split sets source currentCvAdaptationId to null when no analyses remain", async () => {
  await service.splitAnalysisIntoNewApplication("user-1", "app-1", "adapt-only");
  assert.equal(sourceApp.currentCvAdaptationId, null);
});
```

- [ ] **Step 2: Add controller route**

```ts
@Post(":id/analyses/:adaptationId/split")
splitAnalysis(
  @CurrentUser() user: AuthUser,
  @Param("id") id: string,
  @Param("adaptationId") adaptationId: string,
) {
  return this.jobApplicationsService.splitAnalysisIntoNewApplication(user.id, id, adaptationId);
}
```

- [ ] **Step 3: Implement split transaction in service**

```ts
return this.database.$transaction(async (tx) => {
  const source = await loadAndValidateSource(tx, userId, applicationId, adaptationId);
  const created = await tx.jobApplication.create({ data: buildNewApplicationFromAdaptation(source.adaptation) });
  await tx.cvAdaptation.update({ where: { id: adaptationId }, data: { jobApplicationId: created.id } });

  const remaining = await tx.cvAdaptation.findMany({ where: { jobApplicationId: source.application.id }, orderBy: { createdAt: "desc" } });
  const nextCurrent = remaining[0]?.id ?? null;
  await tx.jobApplication.update({ where: { id: source.application.id }, data: { currentCvAdaptationId: nextCurrent } });
  await tx.jobApplication.update({ where: { id: created.id }, data: { currentCvAdaptationId: adaptationId } });

  await emitSplitEvents(tx, source.application.id, created.id, adaptationId);
  return { newApplicationId: created.id };
});
```

- [ ] **Step 4: Run split-focused tests**

Run: `npm run test --workspace @earlycv/api -- src/job-applications/job-applications.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit split behavior**

```bash
git add apps/api/src/job-applications/job-applications.controller.ts apps/api/src/job-applications/job-applications.service.ts apps/api/src/job-applications/job-applications.service.spec.ts
git commit -m "feat(api/job-applications): split analysis into new application with current pointer repoint"
```

### Task 5: Add failing web tests for dashboard and pipeline behavior changes

**Files:**
- Modify: `apps/web/src/app/dashboard/page.structure.spec.ts`
- Modify: `apps/web/src/app/dashboard/candidaturas/candidaturas.test.tsx`
- Modify: `apps/web/src/lib/job-applications-api.ts`

- [ ] **Step 1: Add dashboard test removing flat history and adding highlights block**

```tsx
expect(screen.queryByText("Historico de Analises")).not.toBeInTheDocument();
expect(screen.getByText("Suas candidaturas")).toBeInTheDocument();
expect(screen.getByRole("link", { name: /Ver todas as candidaturas/i })).toHaveAttribute("href", "/dashboard/candidaturas");
```

- [ ] **Step 2: Add pipeline tests for score presentation and locked behavior**

```tsx
expect(screen.getByText("Ainda nao analisada")).toBeInTheDocument();
expect(screen.queryByText(/0%/)).not.toBeInTheDocument();

const locked = screen.getByRole("button", { name: /Liberar CV · 1 credito/i });
await user.click(locked);
expect(openCreditConfirmationMock).toHaveBeenCalledTimes(1);
expect(consumedCreditDirectlyMock).toHaveBeenCalledTimes(0);
```

- [ ] **Step 3: Add/extend API client types for derived fields and highlights**

```ts
export type BestCvState = "ready" | "locked" | "missing";
export type ScorePresentation = "scored" | "not_analyzed";

export type JobApplicationDto = {
  // existing fields
  bestScore: number | null;
  bestCvAdaptationId: string | null;
  bestCvState: BestCvState;
  scorePresentation: ScorePresentation;
};

export async function listJobApplicationHighlights(limit = 3) {
  return apiRequest<JobApplicationDto[]>(`/job-applications/highlights?limit=${limit}`);
}
```

- [ ] **Step 4: Run web tests to confirm failures first**

Run: `npm run test --workspace @earlycv/web -- src/app/dashboard/page.structure.spec.ts src/app/dashboard/candidaturas/candidaturas.test.tsx`
Expected: FAIL.

- [ ] **Step 5: Commit failing web tests/type expectations**

```bash
git add apps/web/src/app/dashboard/page.structure.spec.ts apps/web/src/app/dashboard/candidaturas/candidaturas.test.tsx apps/web/src/lib/job-applications-api.ts
git commit -m "test(web/dashboard): define application-centric dashboard and pipeline behavior"
```

### Task 6: Implement dashboard highlights block and remove flat analysis history

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Modify: `apps/web/src/app/dashboard/history-action-links.tsx` (remove usage path)

- [ ] **Step 1: Replace `listCvAdaptations` usage with highlights API on dashboard**

```ts
const [plan, highlights, resumesResponse] = await Promise.allSettled([
  getMyPlan(),
  listJobApplicationHighlights(3),
  listMyResumes(),
]);
```

- [ ] **Step 2: Remove historical analysis section render block entirely**

```tsx
{/* remove Historical analyses section and pagination controls */}
```

- [ ] **Step 3: Add `Suas candidaturas` render with 3 cards and route CTA**

```tsx
<section aria-label="Suas candidaturas">
  <h2>Suas candidaturas</h2>
  {highlightItems.slice(0, 3).map((item) => (
    <article key={item.id}>{renderApplicationSummary(item)}</article>
  ))}
  <Link href="/dashboard/candidaturas">Ver todas as candidaturas -&gt;</Link>
</section>
```

- [ ] **Step 4: Run dashboard structure test**

Run: `npm run test --workspace @earlycv/web -- src/app/dashboard/page.structure.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit dashboard changes**

```bash
git add apps/web/src/app/dashboard/page.tsx apps/web/src/app/dashboard/history-action-links.tsx
git commit -m "feat(web/dashboard): replace analysis history with top applications summary"
```

### Task 7: Implement pipeline card behavior for score states and locked shortcut flow

**Files:**
- Modify: `apps/web/src/app/dashboard/candidaturas/candidaturas-client.tsx`
- Modify: `apps/web/src/lib/cv-unlock-flow.ts`

- [ ] **Step 1: Implement `scorePresentation` rendering logic**

```tsx
{application.scorePresentation === "scored" ? (
  <span>{`seu melhor score: ${application.bestScore}%`}</span>
) : (
  <>
    <span>Ainda nao analisada</span>
    <small>Analise a vaga para gerar seu primeiro score</small>
  </>
)}
```

- [ ] **Step 2: Update fast download CTA for `ready|locked|missing`**

```tsx
if (application.bestCvState === "ready") {
  return <DownloadBestCvButton adaptationId={application.bestCvAdaptationId!} />;
}
if (application.bestCvState === "locked") {
  return <button onClick={() => openUnlockConfirmation(application)}>Liberar CV · 1 credito</button>;
}
return <button disabled title="Ainda sem CV adaptado">Baixar CV ↓</button>;
```

- [ ] **Step 3: Ensure locked shortcut does not spend silently**

```ts
export function openUnlockConfirmation(input: UnlockInput) {
  return {
    mode: "confirm",
    source: "dashboard-candidaturas-shortcut",
    nextPath: `/dashboard/candidaturas/${input.applicationId}`,
  };
}
```

- [ ] **Step 4: Run candidaturas tests**

Run: `npm run test --workspace @earlycv/web -- src/app/dashboard/candidaturas/candidaturas.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit pipeline card updates**

```bash
git add apps/web/src/app/dashboard/candidaturas/candidaturas-client.tsx apps/web/src/lib/cv-unlock-flow.ts
git commit -m "feat(web/candidaturas): show best-score states and safe locked unlock shortcut"
```

### Task 8: Add detail-page split action wiring and best/current visual markers

**Files:**
- Modify: `apps/web/src/app/dashboard/candidaturas/[id]/detail-client.tsx`
- Modify: `apps/web/src/app/dashboard/candidaturas/[id]/detail-client.test.tsx`
- Modify: `apps/web/src/lib/job-applications-api.ts`

- [ ] **Step 1: Add API client method for split endpoint**

```ts
export async function splitApplicationAnalysis(applicationId: string, adaptationId: string) {
  return apiRequest<{ newApplicationId: string }>(
    `/job-applications/${applicationId}/analyses/${adaptationId}/split`,
    { method: "POST" },
  );
}
```

- [ ] **Step 2: Render split action per analysis row with confirmation**

```tsx
<button onClick={() => onSplitAnalysis(event.cvAdaptationId)}>
  Separar em nova candidatura
</button>
```

- [ ] **Step 3: Render explicit badges for best vs current**

```tsx
{event.cvAdaptationId === application.bestCvAdaptationId && <Badge>Melhor versao</Badge>}
{event.cvAdaptationId === application.currentCvAdaptationId && <Badge>Versao atual</Badge>}
```

- [ ] **Step 4: Add test coverage for split CTA and badge coexistence**

```tsx
expect(screen.getByText("Melhor versao")).toBeInTheDocument();
expect(screen.getByText("Versao atual")).toBeInTheDocument();
expect(screen.getByRole("button", { name: /Separar em nova candidatura/i })).toBeInTheDocument();
```

- [ ] **Step 5: Run detail tests**

Run: `npm run test --workspace @earlycv/web -- src/app/dashboard/candidaturas/[id]/detail-client.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit detail updates**

```bash
git add apps/web/src/app/dashboard/candidaturas/[id]/detail-client.tsx apps/web/src/app/dashboard/candidaturas/[id]/detail-client.test.tsx apps/web/src/lib/job-applications-api.ts
git commit -m "feat(web/candidatura-detail): add split-analysis action and best-vs-current markers"
```

### Task 9: Final verification across impacted workspaces

**Files:**
- Modify: none (verification only)

- [ ] **Step 1: Run API workspace checks**

Run: `npm run check --workspace @earlycv/api && npm run test --workspace @earlycv/api`
Expected: PASS.

- [ ] **Step 2: Run Web workspace checks**

Run: `npm run check --workspace @earlycv/web && npm run test --workspace @earlycv/web`
Expected: PASS.

- [ ] **Step 3: Run root-required verification sequence from project rules**

Run: `npm run check && npm run generate --workspace @earlycv/database && npm run build && npm run test`
Expected: PASS.

- [ ] **Step 4: Inspect git diff and confirm scope integrity**

Run: `git status && git diff --name-only`
Expected: only intended API/Web/spec-plan files changed.

- [ ] **Step 5: Final commit if any verification-only fixes are needed**

```bash
git add <fixed-files>
git commit -m "chore: finalize verification fixes for application-centric flow"
```
