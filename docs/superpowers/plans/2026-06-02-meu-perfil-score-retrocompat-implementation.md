# Meu Perfil Score Retrocompat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore correct score rendering in `/meu-perfil` by preferring `bestScore` and falling back to legacy analysis-derived scores for historical data.

**Architecture:** Keep the compatibility logic local to the `/meu-perfil` route. Reuse existing score parsing from `extractDashboardAnalysisSignal` and fetch legacy adaptation content only for highlight items that are missing `bestScore`, so the new job-application contract remains unchanged.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, existing web API helpers

---

## File Map

- Modify: `apps/web/src/app/meu-perfil/page.tsx` — resolve display scores with `bestScore` first and legacy fallback second; apply resolved values to KPIs and recent applications list.
- Modify: `apps/web/src/app/meu-perfil/page.test.tsx` — cover new score resolution behavior in the route.
- Reference: `apps/web/src/lib/cv-adaptation-api.ts` — existing API helper for adaptation content.
- Reference: `apps/web/src/lib/dashboard-test-metrics.ts` — existing legacy score extraction helper.

### Task 1: Add route-level test coverage for legacy score fallback

**Files:**
- Modify: `apps/web/src/app/meu-perfil/page.test.tsx`
- Reference: `apps/web/src/app/meu-perfil/page.tsx`

- [ ] **Step 1: Write the failing test for legacy fallback in `/meu-perfil/page.test.tsx`**

Add a mocked legacy adaptation content source and a new test case that proves `/meu-perfil` renders fallback score data when `bestScore` is missing.

```tsx
const getCvAdaptationContentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cv-adaptation-api", () => ({
  getCvAdaptationContent: getCvAdaptationContentMock,
}));

it("falls back to legacy analysis score when bestScore is null", async () => {
  listJobApplicationHighlightsMock.mockResolvedValue([
    {
      id: "app-legacy",
      userId: "user-1",
      jobTitle: "BI Analyst",
      companyName: "Insights Ltda",
      status: "SAVED",
      bestScore: null,
      bestCvAdaptationId: "adapt-legacy",
      bestCvState: "ready",
      scorePresentation: "scored",
    },
  ]);

  getCvAdaptationContentMock.mockResolvedValue({
    id: "adapt-legacy",
    adaptedContentJson: {
      projecao_melhoria: {
        score_atual: 55,
        score_pos_otimizacao: 74,
      },
    },
  });

  render(await MeuPerfilPage());

  expect(screen.getByText("74%")).toBeTruthy();
  expect(screen.getByText(/score médio/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- src/app/meu-perfil/page.test.tsx`

Expected: FAIL because `/meu-perfil/page.tsx` does not fetch or resolve legacy score fallback yet.

- [ ] **Step 3: Extend the test file setup to cover the no-fallback case explicitly**

Add one more assertion-oriented test so the route still renders `—` when neither source exists.

```tsx
it("keeps dash when no new or legacy score exists", async () => {
  listJobApplicationHighlightsMock.mockResolvedValue([
    {
      id: "app-empty",
      userId: "user-1",
      jobTitle: "Operations Analyst",
      companyName: "Ops Co",
      status: "SAVED",
      bestScore: null,
      bestCvAdaptationId: null,
      bestCvState: "missing",
      scorePresentation: "not_analyzed",
    },
  ]);

  getCvAdaptationContentMock.mockResolvedValue({
    id: "unused",
    adaptedContentJson: null,
  });

  render(await MeuPerfilPage());

  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
});
```

- [ ] **Step 4: Run the focused test again**

Run: `npm run test --workspace @earlycv/web -- src/app/meu-perfil/page.test.tsx`

Expected: FAIL, still blocked on implementation, but now with both compatibility scenarios captured.

### Task 2: Implement score resolution in `/meu-perfil`

**Files:**
- Modify: `apps/web/src/app/meu-perfil/page.tsx`
- Reference: `apps/web/src/lib/cv-adaptation-api.ts`
- Reference: `apps/web/src/lib/dashboard-test-metrics.ts`

- [ ] **Step 1: Import the existing helpers needed for legacy fallback**

Update the imports at the top of `apps/web/src/app/meu-perfil/page.tsx` to include the adaptation content fetcher and score extractor.

```ts
import { getCvAdaptationContent } from "@/lib/cv-adaptation-api";
import { extractDashboardAnalysisSignal } from "@/lib/dashboard-test-metrics";
```

- [ ] **Step 2: Add minimal route-local helpers for numeric normalization and fallback resolution**

Near the top of the file, keep the existing `toNum` behavior but move it to a reusable helper, plus add a small fallback resolver.

```ts
function toNum(value: unknown): number | null {
  const n = Number(value);
  return value !== null && value !== undefined && !Number.isNaN(n) ? n : null;
}

async function resolveLegacyScore(adaptationId: string | null) {
  if (!adaptationId) return null;

  try {
    const payload = await getCvAdaptationContent(adaptationId);
    return toNum(
      extractDashboardAnalysisSignal(payload.adaptedContentJson).score,
    );
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Resolve display scores only for items missing `bestScore`**

Replace the current `scoredHighlights` preparation with a two-stage flow: resolve per-item display score, then derive the scored list from those values.

```ts
const highlightsWithScores = await Promise.all(
  applicationHighlights.map(async (item) => {
    const directScore = toNum(item.bestScore);
    if (directScore !== null) {
      return { ...item, displayScore: directScore };
    }

    const legacyScore = await resolveLegacyScore(item.bestCvAdaptationId);
    return { ...item, displayScore: legacyScore };
  }),
);

const scoredHighlights = highlightsWithScores.filter(
  (item): item is (typeof item & { displayScore: number }) =>
    item.displayScore !== null,
);
```

- [ ] **Step 4: Apply resolved scores to KPIs and recent applications rendering**

Update the KPI calculations and row rendering to use `displayScore` instead of `bestScore`.

```ts
const averageScore =
  scoredHighlights.length > 0
    ? Math.round(
        scoredHighlights.reduce((sum, item) => sum + item.displayScore, 0) /
          scoredHighlights.length,
      )
    : null;

const bestScore =
  scoredHighlights.length > 0
    ? Math.max(...scoredHighlights.map((item) => item.displayScore))
    : null;

const recentImprovement =
  scoredHighlights.length >= 2
    ? scoredHighlights[0].displayScore - scoredHighlights[1].displayScore
    : null;
```

And in the list rendering:

```ts
const scoreNum = item.displayScore;
const scoreText = scoreNum !== null ? `${Math.round(scoreNum)}%` : "—";
```

- [ ] **Step 5: Run the focused route test to verify it passes**

Run: `npm run test --workspace @earlycv/web -- src/app/meu-perfil/page.test.tsx`

Expected: PASS

### Task 3: Verify impacted web quality gates

**Files:**
- Modify: none
- Verify: `apps/web/src/app/meu-perfil/page.tsx`
- Verify: `apps/web/src/app/meu-perfil/page.test.tsx`

- [ ] **Step 1: Run workspace check for the web app**

Run: `npm run check --workspace @earlycv/web`

Expected: PASS

- [ ] **Step 2: Run web build**

Run: `npm run build --workspace @earlycv/web`

Expected: PASS

- [ ] **Step 3: Run web tests**

Run: `npm run test --workspace @earlycv/web`

Expected: PASS

- [ ] **Step 4: Run repo-level verification required by the project guide**

Run: `npm run check && npm run generate --workspace @earlycv/database && npm run build && npm run test`

Expected: PASS
