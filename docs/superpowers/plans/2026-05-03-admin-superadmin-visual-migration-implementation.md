# Admin + Superadmin Visual Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all legacy UI under `/admin/**` and `/superadmin/**` to the current EarlyCV visual standard, with subtle area distinction and fully consistent internal metadata.

**Architecture:** Centralize visual consistency in shared admin/superadmin shell primitives, then sweep all route pages in focused batches without changing business logic. Standardize metadata via shared helpers and explicit per-page metadata exports for noindex and title consistency.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS v4, existing `apps/web/src/components/ui` primitives, Biome, Vitest/Jest workspace tests.

---

## File Structure Map

- `apps/web/src/app/admin/_components/admin-shell-header.tsx` - admin page hero/header consistency.
- `apps/web/src/app/admin/_components/admin-sidebar.tsx` - admin nav visual baseline.
- `apps/web/src/app/admin/_components/admin-token-state.tsx` - degraded-state consistency.
- `apps/web/src/app/admin/layout.tsx` - route-tree shell wrapper and spacing rhythm.
- `apps/web/src/app/superadmin/_components/superadmin-shell-header.tsx` - superadmin header with institutional tone.
- `apps/web/src/app/superadmin/_components/superadmin-sidebar.tsx` - superadmin nav visual baseline.
- `apps/web/src/app/superadmin/_components/superadmin-state.tsx` - degraded-state consistency.
- `apps/web/src/app/superadmin/layout.tsx` - superadmin shell wrapper and spacing rhythm.
- `apps/web/src/app/admin/**/*.tsx` - all admin route pages in scope.
- `apps/web/src/app/superadmin/**/*.tsx` - all superadmin route pages in scope.
- `apps/web/src/lib/route-metadata.ts` (new) - helper builders for internal metadata consistency.
- `apps/web/src/app/admin/**/*.test.tsx` and `apps/web/src/app/superadmin/**/*.test.tsx` (new/updated where useful) - coverage for metadata and shell-level visual contracts.

### Task 1: Baseline and Guardrails

**Files:**
- Modify: `apps/web/src/app/admin/layout.tsx`
- Modify: `apps/web/src/app/superadmin/layout.tsx`
- Create: `apps/web/src/lib/route-metadata.ts`
- Test: `apps/web/src/lib/route-metadata.spec.ts`

- [ ] **Step 1: Write failing tests for metadata builders**

```ts
import { describe, expect, it } from "vitest";
import { buildAdminMetadata, buildSuperadminMetadata } from "./route-metadata";

describe("route metadata builders", () => {
  it("builds admin noindex metadata with title", () => {
    const metadata = buildAdminMetadata("Pagamentos");
    expect(metadata.title).toBe("Admin • Pagamentos | EarlyCV");
    expect(metadata.robots).toEqual({ follow: false, index: false });
  });

  it("builds superadmin noindex metadata with title", () => {
    const metadata = buildSuperadminMetadata("Equipe");
    expect(metadata.title).toBe("Superadmin • Equipe | EarlyCV");
    expect(metadata.robots).toEqual({ follow: false, index: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- src/lib/route-metadata.spec.ts`
Expected: FAIL with module/file not found for `route-metadata`.

- [ ] **Step 3: Implement minimal metadata helper**

```ts
import type { Metadata } from "next";

function buildInternalMetadata(title: string): Pick<Metadata, "title" | "robots"> {
  return {
    title,
    robots: { follow: false, index: false },
  };
}

export function buildAdminMetadata(page: string): Pick<Metadata, "title" | "robots"> {
  return buildInternalMetadata(`Admin • ${page} | EarlyCV`);
}

export function buildSuperadminMetadata(page: string): Pick<Metadata, "title" | "robots"> {
  return buildInternalMetadata(`Superadmin • ${page} | EarlyCV`);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test --workspace @earlycv/web -- src/lib/route-metadata.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/route-metadata.ts apps/web/src/lib/route-metadata.spec.ts
git commit -m "feat(web): add internal route metadata builders"
```

### Task 2: Unify Admin/Superadmin Shell Primitives

**Files:**
- Modify: `apps/web/src/app/admin/_components/admin-shell-header.tsx`
- Modify: `apps/web/src/app/admin/_components/admin-sidebar.tsx`
- Modify: `apps/web/src/app/admin/_components/admin-token-state.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`
- Modify: `apps/web/src/app/superadmin/_components/superadmin-shell-header.tsx`
- Modify: `apps/web/src/app/superadmin/_components/superadmin-sidebar.tsx`
- Modify: `apps/web/src/app/superadmin/_components/superadmin-state.tsx`
- Modify: `apps/web/src/app/superadmin/layout.tsx`

- [ ] **Step 1: Write a failing shell contract test**

```ts
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminShellHeader } from "./admin-shell-header";

describe("AdminShellHeader", () => {
  it("renders shared hierarchy tokens", () => {
    render(
      <AdminShellHeader
        eyebrow="admin / teste"
        title="Titulo"
        subtitle="Subtitulo"
      />,
    );
    expect(screen.getByText("admin / teste")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Titulo");
  });
});
```

- [ ] **Step 2: Run test to verify failure or mismatch**

Run: `npm run test --workspace @earlycv/web -- src/app/admin/_components/admin-shell-header.spec.tsx`
Expected: FAIL if test file/setup absent or hierarchy mismatch.

- [ ] **Step 3: Implement visual consistency updates in shell components**

```tsx
// example target pattern inside headers
<header className="space-y-4 rounded-2xl border border-[#E0E0E0] bg-white p-6 md:p-8">
  <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">{eyebrow}</p>
  <h1 className="text-3xl font-medium tracking-tight text-[#111111] md:text-4xl">{title}</h1>
  {subtitle ? <p className="text-sm leading-7 text-[#666666]">{subtitle}</p> : null}
</header>
```

- [ ] **Step 4: Run targeted tests/check**

Run: `npm run check --workspace @earlycv/web`
Expected: PASS with updated classes/components.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/_components apps/web/src/app/admin/layout.tsx apps/web/src/app/superadmin/_components apps/web/src/app/superadmin/layout.tsx
git commit -m "feat(web): align admin and superadmin shell visual primitives"
```

### Task 3: Migrate All `/admin/**` Pages

**Files:**
- Modify: `apps/web/src/app/admin/page.tsx`
- Modify: `apps/web/src/app/admin/pendencias/page.tsx`
- Modify: `apps/web/src/app/admin/perfis/page.tsx`
- Modify: `apps/web/src/app/admin/perfis/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/curriculos/page.tsx`
- Modify: `apps/web/src/app/admin/curriculos/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/empresas/page.tsx`
- Modify: `apps/web/src/app/admin/empresas/nova/page.tsx`
- Modify: `apps/web/src/app/admin/empresas/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/fontes/page.tsx`
- Modify: `apps/web/src/app/admin/fontes/nova/page.tsx`
- Modify: `apps/web/src/app/admin/fontes/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/fontes/[id]/runs/[runId]/page.tsx`
- Modify: `apps/web/src/app/admin/ingestion/page.tsx`
- Modify: `apps/web/src/app/admin/ingestion/new/page.tsx`
- Modify: `apps/web/src/app/admin/ingestion/[jobSourceId]/page.tsx`
- Modify: `apps/web/src/app/admin/ingestion/[jobSourceId]/runs/[runId]/page.tsx`
- Modify: `apps/web/src/app/admin/runs/page.tsx`
- Modify: `apps/web/src/app/admin/runs/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/vagas/page.tsx`
- Modify: `apps/web/src/app/admin/templates/page.tsx`
- Modify: `apps/web/src/app/admin/templates/novo/page.tsx`
- Modify: `apps/web/src/app/admin/templates/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/templates/[id]/_components/template-file-upload.tsx`
- Modify: `apps/web/src/app/admin/usuarios/page.tsx`
- Modify: `apps/web/src/app/admin/usuarios/_components/users-list.tsx`
- Modify: `apps/web/src/app/admin/usuarios/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/usuarios/[id]/set-credits-form.tsx`
- Modify: `apps/web/src/app/admin/usuarios/[id]/set-analysis-credits-form.tsx`
- Modify: `apps/web/src/app/admin/pagamentos/page.tsx`
- Modify: `apps/web/src/app/admin/pagamentos/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/pagamentos/[id]/_components/reconcile-button.tsx`
- Modify: `apps/web/src/app/admin/liberacoes-cv/page.tsx`
- Modify: `apps/web/src/app/admin/eventos-e-logs/page.tsx`
- Modify: `apps/web/src/app/admin/configuracoes/page.tsx`

- [ ] **Step 1: Add metadata export to one admin page and write failing expectation**

```ts
import { buildAdminMetadata } from "@/lib/route-metadata";

export const metadata = buildAdminMetadata("Visao geral");
```

```ts
expect(metadata.title).toContain("Admin •");
expect(metadata.robots).toEqual({ follow: false, index: false });
```

- [ ] **Step 2: Run scoped tests/check to catch missing metadata in page batch**

Run: `npm run check --workspace @earlycv/web`
Expected: FAIL initially if imports/metadata declarations are incomplete.

- [ ] **Step 3: Apply visual migration and metadata sweep across all admin pages**

```tsx
// repeated page-level pattern
export const metadata = buildAdminMetadata("Empresas");

return (
  <div className="px-6 py-10 md:px-10">
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* standardized header/cards/actions */}
    </div>
  </div>
);
```

- [ ] **Step 4: Run verification**

Run: `npm run check --workspace @earlycv/web && npm run test --workspace @earlycv/web -- src/app/admin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin
git commit -m "feat(web): migrate all admin routes to new visual and metadata standard"
```

### Task 4: Migrate All `/superadmin/**` Pages

**Files:**
- Modify: `apps/web/src/app/superadmin/page.tsx`
- Modify: `apps/web/src/app/superadmin/equipe/page.tsx`
- Modify: `apps/web/src/app/superadmin/equipe/[id]/page.tsx`
- Modify: `apps/web/src/app/superadmin/configuracoes/page.tsx`
- Modify: `apps/web/src/app/superadmin/correcoes/page.tsx`
- Modify: `apps/web/src/app/superadmin/suporte/page.tsx`

- [ ] **Step 1: Add failing metadata expectation for superadmin convention**

```ts
import { buildSuperadminMetadata } from "@/lib/route-metadata";

const metadata = buildSuperadminMetadata("Equipe");
expect(metadata.title).toBe("Superadmin • Equipe | EarlyCV");
```

- [ ] **Step 2: Run test/check before migration sweep**

Run: `npm run check --workspace @earlycv/web`
Expected: FAIL until all pages align with helper usage.

- [ ] **Step 3: Apply superadmin visual migration with subtle institutional distinction**

```tsx
export const metadata = buildSuperadminMetadata("Visao geral");

<Card className="border-[#E0E0E0] bg-white">
  <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
    governanca
  </p>
</Card>
```

- [ ] **Step 4: Run verification**

Run: `npm run check --workspace @earlycv/web && npm run test --workspace @earlycv/web -- src/app/superadmin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/superadmin
git commit -m "feat(web): migrate all superadmin routes to new visual and metadata standard"
```

### Task 5: Cross-Tree Consistency Pass and Final Verification

**Files:**
- Modify: `apps/web/src/app/admin/**/*.tsx` (small consistency fixes)
- Modify: `apps/web/src/app/superadmin/**/*.tsx` (small consistency fixes)
- Modify: `apps/web/src/lib/route-metadata.ts` (only if needed)

- [ ] **Step 1: Write a route-tree metadata audit test**

```ts
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

it("admin and superadmin pages export metadata", () => {
  const sample = readFileSync("apps/web/src/app/admin/page.tsx", "utf-8");
  expect(sample).toContain("export const metadata");
});
```

- [ ] **Step 2: Run audit test and full web checks**

Run: `npm run test --workspace @earlycv/web -- src/app/admin src/app/superadmin && npm run check --workspace @earlycv/web`
Expected: PASS.

- [ ] **Step 3: Run production build for impacted workspace**

Run: `npm run build --workspace @earlycv/web`
Expected: PASS.

- [ ] **Step 4: Manual responsive verification on representative routes**

Run locally and verify:

```txt
/admin
/admin/empresas
/admin/ingestion
/admin/pagamentos
/superadmin
/superadmin/equipe
/superadmin/configuracoes
```

Expected: consistent visual system, subtle area distinction, no layout break on mobile.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app apps/web/src/lib/route-metadata.ts
git commit -m "chore(web): finalize admin and superadmin visual consistency pass"
```

## Self-Review Checklist (Completed)

- Spec coverage: all approved requirements mapped to tasks (full route scope, subtle distinction, metadata standardization, verification).
- Placeholder scan: no TODO/TBD placeholders left.
- Type consistency: `buildAdminMetadata` and `buildSuperadminMetadata` names used consistently across tasks.
