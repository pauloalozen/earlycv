# Private Header Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar o header privado entre `/dashboard`, `/compras` e `/adaptar`, incluindo exibicao de creditos em `/compras` e `/adaptar` com a mesma regra do dashboard, sem tocar em rotas publicas/SEO.

**Architecture:** Extrair uma funcao pequena e compartilhada para normalizar creditos (`"—"`, `"∞"`, numero), reaplicar essa regra no dashboard, usar no server route de compras e propagar para adaptar via `getAuthStatus()` sem quebrar fluxo client-side atual. O `AppHeader` permanece como fonte unica de comportamento/visual para rotas privadas.

**Tech Stack:** Next.js App Router, TypeScript, React Server/Client Components, Vitest.

---

## File Structure Map

- `apps/web/src/lib/header-credits.ts` (novo)
  - Regra compartilhada de exibicao de creditos para header privado.
- `apps/web/src/lib/header-credits.spec.ts` (novo)
  - Testes unitarios da regra compartilhada.
- `apps/web/src/app/dashboard/page.tsx` (modificar)
  - Reusar helper compartilhado (sem alterar comportamento final).
- `apps/web/src/app/compras/page.tsx` (modificar)
  - Buscar plano, calcular `availableCredits`, passar para `AppHeader`.
- `apps/web/src/lib/session-actions.ts` (modificar)
  - Estender `getAuthStatus()` com campo opcional de creditos para header.
- `apps/web/src/app/adaptar/page.tsx` (modificar)
  - Consumir campo opcional de creditos e passar ao `AppHeader`.

### Task 1: Extrair regra compartilhada de creditos (TDD)

**Files:**
- Create: `apps/web/src/lib/header-credits.ts`
- Create: `apps/web/src/lib/header-credits.spec.ts`
- Modify: `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { toHeaderAvailableCredits } from "./header-credits";

describe("toHeaderAvailableCredits", () => {
  it("returns em dash when plan is unavailable", () => {
    expect(toHeaderAvailableCredits(null)).toBe("—");
  });

  it("returns infinity symbol for unlimited plans", () => {
    expect(toHeaderAvailableCredits({ creditsRemaining: null })).toBe("∞");
  });

  it("returns numeric credits for finite plans", () => {
    expect(toHeaderAvailableCredits({ creditsRemaining: 7 })).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- src/lib/header-credits.spec.ts`
Expected: FAIL with module/file not found for `./header-credits`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type HeaderCreditsPlanLike = {
  creditsRemaining: number | null;
};

export function toHeaderAvailableCredits(
  plan: HeaderCreditsPlanLike | null,
): number | "∞" | "—" {
  if (!plan) {
    return "—";
  }

  return plan.creditsRemaining === null ? "∞" : plan.creditsRemaining;
}
```

- [ ] **Step 4: Reuse helper in dashboard**

Replace inline logic in `apps/web/src/app/dashboard/page.tsx`:

```ts
import { toHeaderAvailableCredits } from "@/lib/header-credits";

// before:
// const availableDownloadCredits = isPlanInfoUnavailable
//   ? "—"
//   : planInfo.creditsRemaining === null
//     ? "∞"
//     : planInfo.creditsRemaining;

// after:
const availableDownloadCredits = toHeaderAvailableCredits(planInfo);
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm run test --workspace @earlycv/web -- src/lib/header-credits.spec.ts`
Expected: PASS with 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/header-credits.ts apps/web/src/lib/header-credits.spec.ts apps/web/src/app/dashboard/page.tsx
git commit -m "refactor(web): extract shared private-header credits display rule"
```

### Task 2: Aplicar creditos no header de /compras (TDD)

**Files:**
- Modify: `apps/web/src/app/compras/page.tsx`
- Test: `apps/web/src/lib/header-credits.spec.ts`

- [ ] **Step 1: Add a regression case in helper test**

Add test case:

```ts
it("returns zero when finite plan has zero credits", () => {
  expect(toHeaderAvailableCredits({ creditsRemaining: 0 })).toBe(0);
});
```

- [ ] **Step 2: Run test to verify baseline**

Run: `npm run test --workspace @earlycv/web -- src/lib/header-credits.spec.ts`
Expected: PASS (ensures helper covers edge case before route wiring).

- [ ] **Step 3: Implement /compras credits fetch and AppHeader prop**

Apply this shape in `apps/web/src/app/compras/page.tsx`:

```ts
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getMyPlan, listMyPurchases, type PurchaseItem } from "@/lib/plans-api";

// ...inside ComprasPage
const [purchasesResult, planResult] = await Promise.allSettled([
  listMyPurchases(),
  getMyPlan(),
]);

const purchases = purchasesResult.status === "fulfilled" ? purchasesResult.value : [];
const fetchError = purchasesResult.status === "rejected";
const availableCredits =
  planResult.status === "fulfilled"
    ? toHeaderAvailableCredits(planResult.value)
    : "—";

// ...header
<AppHeader userName={user.name} availableCredits={availableCredits} />
```

Implementation note: preserve existing purchases error handling semantics (only purchases failure toggles table error state).

- [ ] **Step 4: Run targeted checks for typing/build safety**

Run: `npm run check --workspace @earlycv/web`
Expected: PASS for type/lint checks in web workspace.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/compras/page.tsx apps/web/src/lib/header-credits.spec.ts
git commit -m "feat(web): show dashboard-style credits in compras header"
```

### Task 3: Propagar creditos para /adaptar via session-actions (TDD)

**Files:**
- Modify: `apps/web/src/lib/session-actions.ts`
- Modify: `apps/web/src/app/adaptar/page.tsx`
- Test: `apps/web/src/lib/header-credits.spec.ts`

- [ ] **Step 1: Add compatibility-focused helper test**

Add explicit test case documenting fallback state:

```ts
it("uses em dash fallback for unavailable plan data", () => {
  expect(toHeaderAvailableCredits(null)).toBe("—");
});
```

- [ ] **Step 2: Extend getAuthStatus contract without breaking existing consumers**

Update `apps/web/src/lib/session-actions.ts`:

```ts
import { toHeaderAvailableCredits } from "./header-credits";

export async function getAuthStatus(): Promise<{
  isAuthenticated: boolean;
  userName: string | null;
  hasCredits: boolean | null;
  internalRole: "none" | "admin" | "superadmin" | null;
  availableCreditsDisplay?: number | "∞" | "—";
}> {
  const user = await getCurrentAppUserFromCookies();

  if (!user) {
    return {
      isAuthenticated: false,
      userName: null,
      hasCredits: null,
      internalRole: null,
      availableCreditsDisplay: undefined,
    };
  }

  try {
    const plan = await getMyPlan();
    return {
      isAuthenticated: true,
      userName: user.name ?? null,
      hasCredits: hasAvailableCredits({ creditsRemaining: plan.creditsRemaining }),
      internalRole: user.internalRole,
      availableCreditsDisplay: toHeaderAvailableCredits(plan),
    };
  } catch {
    return {
      isAuthenticated: true,
      userName: user.name ?? null,
      hasCredits: null,
      internalRole: user.internalRole,
      availableCreditsDisplay: "—",
    };
  }
}
```

Rationale: keeps auth semantics intact (authenticated user stays authenticated even if plan fetch fails), and differentiates auth failure vs plan failure.

- [ ] **Step 3: Wire new field into adaptar AppHeader props**

Update `apps/web/src/app/adaptar/page.tsx` state + hydration path:

```ts
const [availableCredits, setAvailableCredits] = useState<number | "∞" | "—" | undefined>(undefined);

Promise.all([
  getAuthStatus(),
  getMyMasterResume().catch(() => null as ResumeDto | null),
]).then(([status, resume]) => {
  setUserName(status.userName ?? null);
  setAvailableCredits(status.availableCreditsDisplay);
  // existing resume/cvMode/authReady logic remains
});

<AppHeader userName={userName} availableCredits={availableCredits} />
```

- [ ] **Step 4: Run checks and full build**

Run: `npm run check`
Expected: PASS at monorepo level.

Run: `npm run build`
Expected: PASS with no route/SEO regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/session-actions.ts apps/web/src/app/adaptar/page.tsx apps/web/src/lib/header-credits.spec.ts
git commit -m "feat(web): unify private header credits on adaptar"
```

### Task 4: Manual validation checklist

**Files:**
- No file changes required.

- [ ] **Step 1: Validate private routes visually while logged in**

Run app and compare header behavior in:

```text
/dashboard
/compras
/adaptar
```

Expected: same `AppHeader` pattern and credits block visible in dropdown on all three routes.

- [ ] **Step 2: Validate credits rendering scenarios**

Check scenarios:

```text
Finite credits -> numeric value
Unlimited plan -> "∞"
Plan fetch failure -> "—"
```

Expected: display rule matches dashboard in every case.

- [ ] **Step 3: Validate public routes untouched**

Open:

```text
/
/blog
/blog/[slug]
```

Expected: still using `PublicNavBar`, no SEO/cache behavior changes.

- [ ] **Step 4: Final commit for any test-only/manual-fix deltas (if needed)**

```bash
git add -A
git commit -m "test(web): validate private header parity and guard public routes"
```

Only create this commit if there are actual tracked changes; otherwise skip.

## Spec Coverage Self-Review

- Header unificado nas rotas privadas alvo: coberto nas Tasks 2 e 3.
- Regra identica ao dashboard (`"—"`, `"∞"`, numero): coberta pela Task 1 e reutilizacao nas Tasks 2/3.
- Reuso de helper para evitar duplicacao: coberto na Task 1 e aplicacao no dashboard/compras/adaptar.
- Nao tocar em public/SEO/PublicNavBar: protegido pela Task 4 (validacao) e escopo dos arquivos modificados.
- Preservar autenticacao/protecao: coberto na Task 3 (contrato `getAuthStatus` com fallback sem deslogar).
- `npm run check` e `npm run build`: coberto na Task 3.

## Placeholder Scan Self-Review

- Nenhum TODO/TBD pendente.
- Todos os passos com comandos e snippets concretos.

## Type Consistency Self-Review

- Tipo compartilhado de exibicao (`number | "∞" | "—"`) mantido entre helper, `session-actions`, `adaptar` e `AppHeader`.
- Campo novo `availableCreditsDisplay` usado com fallback explicito e sem quebrar consumidores existentes.
