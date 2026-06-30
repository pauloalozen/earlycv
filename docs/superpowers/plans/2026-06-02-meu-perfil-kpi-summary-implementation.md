# Meu Perfil KPI Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/meu-perfil` KPI cards use real user totals while keeping the recent-applications list based on `highlights(3)`.

**Architecture:** Keep `listJobApplicationHighlights(3)` dedicated to the recent list. Introduce a separate summary endpoint/helper for KPI totals so `Candidaturas ativas`, `CVs analisados`, and `Score medio` reflect the full user dataset, not just the three displayed highlights.

**Tech Stack:** NestJS, Next.js App Router, TypeScript, Vitest, Node test runner

---

## File Map

- Modify: `apps/api/src/job-applications/job-applications.service.ts` — add KPI summary aggregation for the authenticated user.
- Modify: `apps/api/src/job-applications/job-applications.controller.ts` — expose a summary route.
- Modify: `apps/api/src/job-applications/job-applications.service.spec.ts` — cover summary aggregation logic.
- Modify: `apps/api/src/job-applications/job-applications.controller.spec.ts` — cover summary controller delegation.
- Modify: `apps/web/src/lib/job-applications-api.ts` — add a typed summary fetch helper.
- Modify: `apps/web/src/app/meu-perfil/page.tsx` — consume the summary for KPIs while keeping highlights for the list.
- Modify: `apps/web/src/app/meu-perfil/page.test.tsx` — mock summary data and validate KPI totals are independent from the highlights subset.

### Task 1: Add failing API tests for KPI summary aggregation

**Files:**
- Modify: `apps/api/src/job-applications/job-applications.service.spec.ts`
- Modify: `apps/api/src/job-applications/job-applications.controller.spec.ts`
- Reference: `apps/api/src/job-applications/job-applications.service.ts`
- Reference: `apps/api/src/job-applications/job-applications.controller.ts`

- [ ] **Step 1: Add a failing service test for real KPI totals**

Create a service-level test proving the new summary uses the full active dataset and not just top highlights.

The test fixture should include at least:

- 4 active applications (`SAVED`, `ANALYZED`, `APPLIED`, `INTERVIEW`)
- 1 closed application (`REJECTED`)
- 3 applications with resolved score data

Expected result:

- `activeApplicationsCount` = `4`
- `analyzedCvsCount` = `3`
- `averageScore` = rounded average of the three resolved scores

```ts
test("getHighlightsSummary returns full KPI totals for the user", async () => {
  const db = makeDb({
    jobApplication: {
      ...(makeDb().jobApplication as Record<string, unknown>),
      findMany: async () => [
        /* 5 seeded applications with mixed status + adaptation score data */,
      ],
    },
  });

  const service = new JobApplicationsServiceCtor(db);
  const summary = await service.getHighlightsSummary("user-1");

  assert.equal(summary.activeApplicationsCount, 4);
  assert.equal(summary.analyzedCvsCount, 3);
  assert.equal(summary.averageScore, 79);
});
```

- [ ] **Step 2: Add a failing controller test for the summary route**

Add a controller test proving the new route delegates to the service with the authenticated user and returns the summary payload.

```ts
test("summary/controller delegates to service with authenticated user", async () => {
  const db = makeDb();
  const service = new JobApplicationsServiceCtor(db);
  const controller = new JobApplicationsController(service, interviewPrepStub);

  (service as unknown as {
    getHighlightsSummary: (userId: string) => Promise<{
      activeApplicationsCount: number;
      analyzedCvsCount: number;
      averageScore: number | null;
    }>;
  }).getHighlightsSummary = async (userId: string) => {
    assert.equal(userId, "user-1");
    return {
      activeApplicationsCount: 4,
      analyzedCvsCount: 3,
      averageScore: 79,
    };
  };

  const response = await controller.getHighlightsSummary({ id: "user-1" });

  assert.deepEqual(response, {
    activeApplicationsCount: 4,
    analyzedCvsCount: 3,
    averageScore: 79,
  });
});
```

- [ ] **Step 3: Run the targeted API tests to verify they fail**

Run: `npm run test --workspace @earlycv/api -- src/job-applications/job-applications.controller.spec.ts src/job-applications/job-applications.service.spec.ts`

Expected: FAIL because `getHighlightsSummary` and the controller route do not exist yet.

### Task 2: Implement the API summary route

**Files:**
- Modify: `apps/api/src/job-applications/job-applications.service.ts`
- Modify: `apps/api/src/job-applications/job-applications.controller.ts`

- [ ] **Step 1: Add the service method for KPI summary aggregation**

Implement a new method on `JobApplicationsService` that scans the user’s non-archived, non-deleted applications and returns:

```ts
{
  activeApplicationsCount: number;
  analyzedCvsCount: number;
  averageScore: number | null;
}
```

Reuse existing status groupings semantically:

- active = open + in-process statuses
- analyzed = applications with resolved score data from derived summary

Follow the same score derivation source already used in `deriveSummaryFromAdaptations`.

- [ ] **Step 2: Add the controller route**

Expose a new authenticated GET route in `job-applications.controller.ts`:

```ts
@Get("highlights/summary")
getHighlightsSummary(@AuthenticatedUser() user: { id: string }) {
  return this.service.getHighlightsSummary(user.id);
}
```

- [ ] **Step 3: Run the targeted API tests to verify they pass**

Run: `npm run test --workspace @earlycv/api -- src/job-applications/job-applications.controller.spec.ts src/job-applications/job-applications.service.spec.ts`

Expected: PASS

### Task 3: Update the web client and `/meu-perfil` to use the real summary

**Files:**
- Modify: `apps/web/src/lib/job-applications-api.ts`
- Modify: `apps/web/src/app/meu-perfil/page.tsx`
- Modify: `apps/web/src/app/meu-perfil/page.test.tsx`

- [ ] **Step 1: Add a typed web helper for the summary endpoint**

In `apps/web/src/lib/job-applications-api.ts`, add:

```ts
export type JobApplicationHighlightsSummaryDto = {
  activeApplicationsCount: number;
  analyzedCvsCount: number;
  averageScore: number | null;
};

export async function getJobApplicationHighlightsSummary(): Promise<JobApplicationHighlightsSummaryDto> {
  const response = await apiRequest("GET", "/job-applications/highlights/summary");
  if (!response.ok) {
    throw new Error("Falha ao carregar resumo das candidaturas");
  }
  return response.json() as Promise<JobApplicationHighlightsSummaryDto>;
}
```

- [ ] **Step 2: Update `/meu-perfil` to fetch both sources separately**

Change the route so it fetches:

- `getMyPlan()`
- `listJobApplicationHighlights(3)` for the recent list
- `getJobApplicationHighlightsSummary()` for KPI totals
- `getMyMasterResume()`

Use the summary object for:

- `Candidaturas ativas`
- `CVs analisados`
- `Score médio`

Keep `highlightsWithScores` and recent-list rendering intact for the list section.

- [ ] **Step 3: Update the route tests to mock summary totals separately from highlights**

In `apps/web/src/app/meu-perfil/page.test.tsx`:

- mock `getJobApplicationHighlightsSummary`
- keep highlights focused on the visible recent list
- assert KPI totals come from summary, not from the visible subset

Example focused expectation:

```tsx
expect(within(activeKpi as HTMLElement).getByText("4")).toBeTruthy();
expect(within(analyzedKpi as HTMLElement).getByText("3")).toBeTruthy();
expect(within(averageKpi as HTMLElement).getByText("79%")).toBeTruthy();
```

while the list itself can still render only 3 recent applications.

- [ ] **Step 4: Run the focused web test to verify it passes**

Run: `npm run test:ui --workspace @earlycv/web -- src/app/meu-perfil/page.test.tsx`

Expected: PASS

### Task 4: Verify the impacted scope

**Files:**
- Modify: none
- Verify: API and web files above

- [ ] **Step 1: Run web check**

Run: `npm run check --workspace @earlycv/web`

Expected: PASS, or only the same pre-existing unrelated warning with no new `/meu-perfil` issues.

- [ ] **Step 2: Run web build**

Run: `npm run build --workspace @earlycv/web`

Expected: PASS

- [ ] **Step 3: Run web tests**

Run: `npm run test --workspace @earlycv/web`

Expected: PASS

- [ ] **Step 4: Run targeted API tests again**

Run: `npm run test --workspace @earlycv/api -- src/job-applications/job-applications.controller.spec.ts src/job-applications/job-applications.service.spec.ts`

Expected: PASS
