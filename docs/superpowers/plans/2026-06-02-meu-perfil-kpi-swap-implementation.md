# Meu Perfil KPI Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ambiguous `Melhoria recente` KPI in `/meu-perfil` with clearer operational metrics: `Candidaturas ativas`, `CVs analisados`, and `Score medio`.

**Architecture:** Keep the change local to the `/meu-perfil` route and its route test. Reuse the existing job-application status groupings already defined for `/candidaturas` to count active applications, and reuse the current resolved-score list to count analyzed CVs and preserve `Score medio` behavior.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, existing web status helpers

---

## File Map

- Modify: `apps/web/src/app/meu-perfil/page.tsx` — replace KPI labels and values, remove `Melhoria recente`, count active applications using existing status groups.
- Modify: `apps/web/src/app/meu-perfil/page.test.tsx` — update assertions to reflect the new KPI labels and values.
- Reference: `apps/web/src/lib/job-application-status.ts` — existing source of truth for open/in-process/closed status groupings.

### Task 1: Update `/meu-perfil` tests for the new KPI semantics

**Files:**
- Modify: `apps/web/src/app/meu-perfil/page.test.tsx`
- Reference: `apps/web/src/app/meu-perfil/page.tsx`

- [ ] **Step 1: Write the failing test expectations for the KPI label swap**

In the existing `renders the hub with the reference composition` test, replace the old KPI assertions so the route now expects `Candidaturas ativas` and `CVs analisados`, and no longer expects `Melhoria recente`.

```tsx
expect(screen.getByText(/candidaturas ativas/i)).toBeTruthy();
expect(screen.getByText(/cvs analisados/i)).toBeTruthy();
expect(screen.getByText(/score médio/i)).toBeTruthy();
expect(screen.queryByText(/melhoria recente/i)).toBeNull();
```

- [ ] **Step 2: Add a focused KPI-value assertion test**

Add a new test that proves the mock data produces the expected counts:

- `Candidaturas ativas` = `3`
- `CVs analisados` = `2`
- `Score médio` = `79%`

Use the default fixture from `beforeEach`, where the statuses are `APPLIED`, `INTERVIEW`, and `SAVED`, and only the first two items have scores.

```tsx
it("shows active applications, analyzed CVs, and average score", async () => {
  render(await MeuPerfilPage());

  const activeKpi = screen.getByText(/candidaturas ativas/i).closest("div");
  const analyzedKpi = screen.getByText(/cvs analisados/i).closest("div");
  const averageKpi = screen.getByText(/score médio/i).closest("div");

  expect(within(activeKpi as HTMLElement).getByText("3")).toBeTruthy();
  expect(within(analyzedKpi as HTMLElement).getByText("2")).toBeTruthy();
  expect(within(averageKpi as HTMLElement).getByText("79%")).toBeTruthy();
});
```

- [ ] **Step 3: Run the focused route test to verify it fails**

Run: `npm run test:ui --workspace @earlycv/web -- src/app/meu-perfil/page.test.tsx`

Expected: FAIL because the page still renders `Vagas analisadas` and `Melhoria recente`.

### Task 2: Replace the KPI logic in `/meu-perfil`

**Files:**
- Modify: `apps/web/src/app/meu-perfil/page.tsx`
- Reference: `apps/web/src/lib/job-application-status.ts`

- [ ] **Step 1: Import the existing status groupings**

Update the imports in `apps/web/src/app/meu-perfil/page.tsx` to reuse the same status taxonomy from `/candidaturas`.

```ts
import {
  CLOSED_STATUSES,
  IN_PROCESS_STATUSES,
  OPEN_STATUSES,
  getStatusConfig,
} from "@/lib/job-application-status";
```

- [ ] **Step 2: Compute the new KPI values from existing page data**

Remove `recentImprovement` and add two new derived values near the current KPI preparation:

```ts
const activeStatuses = new Set([...OPEN_STATUSES, ...IN_PROCESS_STATUSES]);

const activeApplicationsCount = applicationHighlights.filter((item) =>
  activeStatuses.has(item.status),
).length;

const analyzedCvsCount = scoredHighlights.length;
```

Do not add new helpers unless necessary.

- [ ] **Step 3: Replace the KPI card configuration array**

Update the KPI section so the three cards become:

```ts
[
  {
    label: "Candidaturas ativas",
    value: String(activeApplicationsCount),
    accent: false,
  },
  {
    label: "CVs analisados",
    value: String(analyzedCvsCount),
    accent: analyzedCvsCount > 0,
  },
  {
    label: "Score médio",
    value: bestScore === null ? "—" : `${averageScore ?? bestScore}%`,
    accent: bestScore !== null,
  },
]
```

This is a KPI swap only. Do not change the surrounding layout structure.

- [ ] **Step 4: Run the focused route test to verify it passes**

Run: `npm run test:ui --workspace @earlycv/web -- src/app/meu-perfil/page.test.tsx`

Expected: PASS

### Task 3: Verify the impacted web scope

**Files:**
- Modify: none
- Verify: `apps/web/src/app/meu-perfil/page.tsx`
- Verify: `apps/web/src/app/meu-perfil/page.test.tsx`

- [ ] **Step 1: Run web workspace check**

Run: `npm run check --workspace @earlycv/web`

Expected: PASS, or the same pre-existing warning outside this feature scope with no new errors from `/meu-perfil`.

- [ ] **Step 2: Run web build**

Run: `npm run build --workspace @earlycv/web`

Expected: PASS

- [ ] **Step 3: Run web workspace tests**

Run: `npm run test --workspace @earlycv/web`

Expected: PASS
