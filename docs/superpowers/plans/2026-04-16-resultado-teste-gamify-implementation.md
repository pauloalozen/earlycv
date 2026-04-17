# 2026-04-16-resultado-teste-gamify-implementation.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copy /adaptar/resultado to /resultado-teste + gamify com metrics bars/deltas (+/- pts itens). Reutiliza UI/cards/table. Assume AI data {score,metrics:{keywords:{match:60,missing:['Python']},...},deltas:{exp:+25,...}}.

**Architecture:** RSC page parse JSON data → render cards/bars/table com deltas. New ui/metric-bar, delta-badge, keyword-table. Teaser blur numbers. No backend change (mock data teste).

**Tech Stack:** Next.js App Router TSX, Tailwind v4, shadcn/ui (Card, Badge), Biome, react-hook-form? No. Test: snapshot page.

---

## File Structure
- Copy: apps/web/src/app/adaptar/resultado/page.tsx → resultado-teste/page.tsx
- Copy: deps (ex: actions, components local)
- Create: apps/web/src/components/ui/metric-bar.tsx (stacked bar % segments)
- Create: apps/web/src/components/ui/delta-badge.tsx (+/- pts badge verde/vermelho)
- Create: apps/web/src/components/ui/keyword-table.tsx (table presente/faltante +pts)
- Modify: resultado-teste/page.tsx (parse data, render new comps, blur teaser)
- Test: apps/web/src/app/adaptar/resultado-teste/page.test.tsx (snapshot render)
- Docs: AGENTS.md update UI rules.

---

### Task 1: Copy route estrutura /resultado-teste

**Files:**
- Bash copy dir
- Glob verify

- [ ] **Step 1: Copy files**
```bash
cp -r apps/web/src/app/adaptar/resultado apps/web/src/app/adaptar/resultado-teste
```
- [ ] **Step 2: Verify structure**
```bash
ls apps/web/src/app/adaptar/resultado-teste
# Expected: page.tsx + any local
```
- [ ] **Step 3: Commit**
```bash
git add apps/web/src/app/adaptar/resultado-teste
git commit -m "feat: copy resultado to resultado-teste base"
```

### Task 2: New ui/metric-bar (stacked % bar segments)

**Files:**
- Create: apps/web/src/components/ui/metric-bar.tsx
- Test: apps/web/src/components/ui/metric-bar.test.tsx

- [ ] **Step 1: Write failing test**
```tsx
// metric-bar.test.tsx
import { render, screen } from '@testing-library/react';

test('renders stacked bar with segments', () => {
  render(<MetricBar score={72} metrics={{skills:25,keywords:30,...}} />);
  expect(screen.getByText('72%')).toBeInTheDocument();
  // segments widths
});
```
- [ ] **Step 2: Run fail**
npm test src/components/ui/metric-bar.test.tsx
- [ ] **Step 3: Impl min**
```tsx
// metric-bar.tsx
export function MetricBar({ score, metrics }: {score:number, metrics:{[k:string]:number}}) {
  const segments = Object.values(metrics).map(v => `${v}% ${color(v)}`);
  return <div className="stacked-bar">{segments.map(s => <div className={s.class} style={{width:s.w}}/>)} <span>{score}%</span></div>
}
```
- [ ] **Step 4: Pass test**
npm test
- [ ] **Step 5: Export index.ts, showcase /ui**
- [ ] **Commit** "feat: ui/metric-bar stacked"

(Continue similar for delta-badge, keyword-table: Badge +/-, Table sortable.)

### Task 3: Update page.tsx parse/render gamify

**Files:**
- Modify: resultado-teste/page.tsx

- [ ] **Test fail:** Snapshot current vs new props.
- [ ] **Impl:** Parse data.metrics to bars, deltas badges in cards, keyword table faltas/presentes.
Blur: class blur-md on teaser numbers.
- [ ] **Commit**

### Task 4: Lint/build/test

- [ ] npm run check/build
- [ ] Snapshot test page render metrics.
- [ ] Commit final.

**Final Verification:** npm run check/build/test. Teste browser /adaptar/resultado-teste mock data JSON.