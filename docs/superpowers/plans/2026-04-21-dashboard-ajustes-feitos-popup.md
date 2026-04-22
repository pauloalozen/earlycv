# Dashboard Ajustes Feitos Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `Ajustes feitos` action in dashboard history for released CVs and show a popup with score before, final score, and adaptation notes.

**Architecture:** Parse popup data from existing adaptation content payload in dashboard server rendering, pass item-level popup props into the history actions client component, and render a modal via portal with project-consistent visuals and accessibility behaviors.

**Tech Stack:** Next.js App Router, React client/server components, TypeScript, node:test for unit tests.

---

### Task 1: Extend dashboard analysis signal model

**Files:**
- Modify: `apps/web/src/lib/dashboard-test-metrics.ts`
- Test: `apps/web/src/lib/dashboard-test-metrics.spec.ts`

- [ ] **Step 1: Write failing tests for adjustments signal extraction**

```ts
test("extractDashboardAnalysisSignal exposes adjustments popup data", () => {
  const signal = extractDashboardAnalysisSignal({
    fit: { score: 82 },
    projecao_melhoria: { score_atual: 69 },
    adaptation_notes: "Resumo dos ajustes",
  });

  assert.equal(signal.adjustments.scoreBefore, 69);
  assert.equal(signal.adjustments.scoreFinal, 82);
  assert.equal(signal.adjustments.notes, "Resumo dos ajustes");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- src/lib/dashboard-test-metrics.spec.ts`
Expected: FAIL because `adjustments` does not exist yet in return type.

- [ ] **Step 3: Implement minimal adjustments extraction**

```ts
type AnalysisSignal = {
  score: number | null;
  improvement: number | null;
  adjustments: {
    scoreBefore: number | null;
    scoreFinal: number | null;
    notes: string | null;
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/web -- src/lib/dashboard-test-metrics.spec.ts`
Expected: PASS.

### Task 2: Wire popup data from dashboard page into history actions

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Add failing type expectations by passing new prop shape**

```tsx
<HistoryActionLinks
  actions={actions}
  hasCredits={hasCredits}
  adjustments={history.adjustments}
/>
```

- [ ] **Step 2: Run type check to verify failure**

Run: `npm run check --workspace @earlycv/web`
Expected: FAIL because `adjustments` prop is missing in `HistoryActionLinks` props.

- [ ] **Step 3: Keep dashboard parser and passing logic minimal**

```ts
signal: extractDashboardAnalysisSignal(content.adaptedContentJson)
```

and

```ts
adjustments: analysisSignalsById.get(item.id)?.adjustments ?? {
  scoreBefore: null,
  scoreFinal: null,
  notes: null,
}
```

- [ ] **Step 4: Re-run type check**

Run: `npm run check --workspace @earlycv/web`
Expected: FAIL still until Task 3 adds prop contract.

### Task 3: Add button and popup in history actions (client)

**Files:**
- Modify: `apps/web/src/app/dashboard/history-action-links.tsx`

- [ ] **Step 1: Write failing behavior tests or static assertions for action visibility logic**

Use a pure helper exported from this file:

```ts
export function shouldShowAdjustmentsAction(input: { ... }): boolean
```

and test that it only returns `true` when released + any useful data.

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test --workspace @earlycv/web -- src/lib/dashboard-test-metrics.spec.ts`
Expected: FAIL because helper is not implemented/exported.

- [ ] **Step 3: Implement popup action and modal**

Implement in `HistoryActionLinks`:

```tsx
{showAdjustments ? (
  <button type="button" ...>Ajustes feitos</button>
) : null}
```

and modal via `createPortal` with:
- title `Ajustes feitos`
- score before/final
- notes block `O que foi feito no seu CV`
- close by X/backdrop/Esc

- [ ] **Step 4: Run check and relevant tests**

Run:
- `npm run test --workspace @earlycv/web -- src/lib/dashboard-test-metrics.spec.ts`
- `npm run check --workspace @earlycv/web`

Expected: PASS for touched tests and checks.

### Task 4: Validate end-to-end behavior locally

**Files:**
- Modify: none (verification)

- [ ] **Step 1: Start app and validate dashboard UX manually**

Run: `npm run dev:web`

- [ ] **Step 2: Verify acceptance scenarios**

1. Released item with notes/scores shows `Ajustes feitos`.
2. Not released item hides button.
3. Popup opens with score before + final (`fit.score`) + notes.
4. Popup closes on Esc/backdrop/X.

- [ ] **Step 3: Commit changes**

```bash
git add apps/web/src/lib/dashboard-test-metrics.ts apps/web/src/lib/dashboard-test-metrics.spec.ts apps/web/src/app/dashboard/page.tsx apps/web/src/app/dashboard/history-action-links.tsx docs/superpowers/specs/2026-04-21-dashboard-ajustes-feitos-popup-design.md docs/superpowers/plans/2026-04-21-dashboard-ajustes-feitos-popup.md
git commit -m "feat: add dashboard ajustes feitos action and modal details"
```
