# Global Route Transition Spinner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global route-transition spinner and smoother page reveal for all App Router routes during client-side navigation, without forcing spinner on first hard load.

**Architecture:** Convert root `app/template.tsx` into a small Client Component transition controller with phased state (`loading` -> `revealing` -> `done`). Use shared CSS classes in `globals.css` for overlay, spinner, and content reveal animation. Remove route-local loading/reveal overlay from `/adaptar/resultado` to avoid duplicated loaders and conflicting animations.

**Tech Stack:** Next.js App Router, React Client Components, TypeScript, Tailwind CSS v4 utilities + custom CSS in `globals.css`, Biome, workspace tests.

---

## File Structure and Responsibilities

- Modify: `apps/web/src/app/template.tsx`
  - Global transition phase controller mounted per route navigation.
- Modify: `apps/web/src/app/globals.css`
  - Shared transition classes/keyframes and reduced-motion behavior.
- Modify: `apps/web/src/app/adaptar/resultado/page.tsx`
  - Remove local full-screen ready overlay and local reveal style so global transition is canonical.
- Verify: `apps/web/src/app/layout.tsx`
  - Ensure root layout remains server-rendered and untouched for SEO/metadata behavior.

---

### Task 1: Add Global Transition Controller in Root Template

**Files:**
- Modify: `apps/web/src/app/template.tsx`
- Test: manual navigation smoke check (routes listed in Task 4)

- [ ] **Step 1: Write the failing test (behavior assertion script)**

Create a temporary Node verification script at `tmp/verify-template-transition.mjs`:

```js
import { readFileSync } from "node:fs";

const content = readFileSync("apps/web/src/app/template.tsx", "utf8");

if (!content.includes("use client")) {
  throw new Error("template.tsx is not a client component");
}

if (!content.includes("loading") || !content.includes("revealing") || !content.includes("done")) {
  throw new Error("transition phases are missing");
}

if (!content.includes("route-transition-overlay") || !content.includes("route-transition-content")) {
  throw new Error("global transition classes are missing in template markup");
}

console.log("template transition structure verified");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node tmp/verify-template-transition.mjs
```

Expected: FAIL because current `template.tsx` is static and lacks phase controller + classes.

- [ ] **Step 3: Write minimal implementation**

Replace `apps/web/src/app/template.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";

type TransitionPhase = "loading" | "revealing" | "done";

const MIN_SPINNER_MS = 180;
const REVEAL_MS = 340;

export default function Template({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [phase, setPhase] = useState<TransitionPhase>("loading");

  useEffect(() => {
    const revealTimer = window.setTimeout(() => {
      setPhase("revealing");
    }, MIN_SPINNER_MS);

    const doneTimer = window.setTimeout(() => {
      setPhase("done");
    }, MIN_SPINNER_MS + REVEAL_MS);

    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);

  return (
    <>
      {phase !== "done" && (
        <div
          className={`route-transition-overlay ${phase === "revealing" ? "route-transition-overlay--exit" : ""}`}
          aria-live="polite"
          aria-busy="true"
        >
          <div className="route-transition-spinner" aria-hidden="true" />
        </div>
      )}

      <div className={`route-transition-content route-transition-content--${phase}`}>
        {children}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node tmp/verify-template-transition.mjs
```

Expected: PASS with `template transition structure verified`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/template.tsx tmp/verify-template-transition.mjs
git commit -m "feat(web): add global route transition template controller"
```

---

### Task 2: Add Shared Transition CSS and Reduced-Motion Rules

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Test: style verification script + `npm run check`

- [ ] **Step 1: Write the failing test (behavior assertion script)**

Create `tmp/verify-transition-css.mjs`:

```js
import { readFileSync } from "node:fs";

const css = readFileSync("apps/web/src/app/globals.css", "utf8");

const required = [
  ".route-transition-overlay",
  ".route-transition-spinner",
  ".route-transition-content--loading",
  ".route-transition-content--revealing",
  "@keyframes route-content-reveal",
  "@keyframes route-overlay-exit",
  "prefers-reduced-motion: reduce",
];

for (const token of required) {
  if (!css.includes(token)) {
    throw new Error(`missing CSS token: ${token}`);
  }
}

console.log("transition css structure verified");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node tmp/verify-transition-css.mjs
```

Expected: FAIL because classes/keyframes do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/web/src/app/globals.css`:

```css
.route-transition-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f2f2f2;
}

.route-transition-overlay--exit {
  animation: route-overlay-exit 180ms ease-out forwards;
}

.route-transition-spinner {
  height: 2rem;
  width: 2rem;
  border-radius: 9999px;
  border: 2px solid #cccccc;
  border-top-color: #111111;
  animation: route-spinner 700ms linear infinite;
}

.route-transition-content {
  min-height: 100%;
}

.route-transition-content--loading {
  opacity: 0;
}

.route-transition-content--revealing {
  animation: route-content-reveal 340ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.route-transition-content--done {
  opacity: 1;
  transform: translateY(0);
}

@keyframes route-spinner {
  to {
    transform: rotate(360deg);
  }
}

@keyframes route-overlay-exit {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
    visibility: hidden;
  }
}

@keyframes route-content-reveal {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .route-transition-overlay--exit,
  .route-transition-content--revealing {
    animation: none;
  }

  .route-transition-content--loading,
  .route-transition-content--done,
  .route-transition-content--revealing {
    opacity: 1;
    transform: none;
  }

  .route-transition-spinner {
    animation-duration: 1.4s;
  }
}
```

- [ ] **Step 4: Run tests to verify pass and no lint regressions**

Run:

```bash
node tmp/verify-transition-css.mjs && npm run check
```

Expected: PASS + `npm run check` succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css tmp/verify-transition-css.mjs
git commit -m "feat(web): add shared route transition overlay and reveal styles"
```

---

### Task 3: Remove Local Transition Overlay from `/adaptar/resultado`

**Files:**
- Modify: `apps/web/src/app/adaptar/resultado/page.tsx`
- Test: `npm run check` and navigation verification

- [ ] **Step 1: Write the failing test (behavior assertion script)**

Create `tmp/verify-no-local-overlay.mjs`:

```js
import { readFileSync } from "node:fs";

const page = readFileSync("apps/web/src/app/adaptar/resultado/page.tsx", "utf8");

if (page.includes("const [ready, setReady]")) {
  throw new Error("local ready state still exists");
}

if (page.includes("!ready &&")) {
  throw new Error("local loading overlay still rendered");
}

if (page.includes("transition-all duration-500 ease-out")) {
  throw new Error("local page reveal transition still exists");
}

console.log("local route overlay cleanup verified");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node tmp/verify-no-local-overlay.mjs
```

Expected: FAIL because page still contains local `ready` overlay logic.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/app/adaptar/resultado/page.tsx`, apply these exact changes:

1) Remove local ready state:

```tsx
// remove:
const [ready, setReady] = useState(false);
```

2) Remove ready effect:

```tsx
// remove entire effect:
useEffect(() => {
  if (!data) return;
  const timer = setTimeout(() => setReady(true), 150);
  return () => clearTimeout(timer);
}, [data]);
```

3) Remove overlay gate block:

```tsx
// remove:
{!ready && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F2F2F2]">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111]" />
  </div>
)}
```

4) Simplify main wrapper class/style:

```tsx
<main className="min-h-screen bg-[#F2F2F2] text-[#111]">
```

5) Keep the `if (!data)` loading fallback intact (data fetch lifecycle), only removing route-transition duplicate behavior.

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
node tmp/verify-no-local-overlay.mjs && npm run check
```

Expected: PASS for script and lint/check.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/adaptar/resultado/page.tsx tmp/verify-no-local-overlay.mjs
git commit -m "refactor(web): remove local resultado transition overlay in favor of global template"
```

---

### Task 4: End-to-End Validation and Cleanup

**Files:**
- Modify: none expected (unless bugfix is required)
- Verify: workspace checks/tests and manual route transitions

- [ ] **Step 1: Run full automated validation**

Run:

```bash
npm run check && npm run test
```

Expected: all workspace checks and tests pass.

- [ ] **Step 2: Run local app for manual route-transition verification**

Run:

```bash
npm run dev --workspace @earlycv/web
```

Manual verification checklist:

- Navigate `/` -> `/adaptar` -> `/adaptar/resultado` -> `/dashboard` -> `/planos` -> `/entrar`.
- Confirm spinner appears during client-side route transitions.
- Confirm first hard load does not intentionally block with global spinner.
- Confirm reveal feels smoother than old `-8px` page lift.

- [ ] **Step 3: Remove temporary verification scripts**

Run:

```bash
rm "tmp/verify-template-transition.mjs" "tmp/verify-transition-css.mjs" "tmp/verify-no-local-overlay.mjs"
```

Then verify cleanup:

```bash
ls tmp
```

Expected: three temporary files are gone.

- [ ] **Step 4: Re-run check after cleanup**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit final validated slice**

```bash
git add apps/web/src/app/template.tsx apps/web/src/app/globals.css apps/web/src/app/adaptar/resultado/page.tsx
git commit -m "feat(web): standardize route-transition spinner and smooth reveal across routes"
```

---

## Spec Coverage Review

- Global default behavior for existing + future routes: covered by Task 1 (`template.tsx`) + Task 2 (`globals.css`).
- Spinner only in route transitions: covered by App Router template remount behavior and Task 4 manual verification.
- Smoother reveal than current behavior: covered by Task 2 timing/easing/offset (`translateY(4px)`, 340ms, custom cubic-bezier).
- Avoid duplicate loaders: covered by Task 3 cleanup in `/adaptar/resultado`.
- Integrity verification: covered by Task 4 automated + manual validation.

## Placeholder and Consistency Review

- No `TODO`/`TBD` placeholders.
- All tasks include exact file paths, commands, and concrete code.
- Transition class names are consistent between template and CSS (`route-transition-*`).
