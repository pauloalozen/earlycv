# Mercado Pago Pro Pre-Redirect Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar um passo de confirmacao antes da abertura do checkout Pro, abrindo o Mercado Pago em nova aba e redirecionando a aba atual para aguardando efetivacao.

**Architecture:** O fluxo sera movido do POST server-only com redirect direto para um submit client-side em `planos/page.tsx`. Esse submit chamara um endpoint JSON no web app que encapsula `createPlanCheckout`, retornara `checkoutUrl` e `purchaseId`, e o client controlara modal, `window.open` e navegacao para `/pagamento/pendente?checkoutId=<purchaseId>`. A rota legada `/plans/checkout` sera mantida para compatibilidade.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Testing Library/Vitest (web), API proxy interno do `apps/web`.

---

### Task 1: Expor endpoint JSON para iniciar checkout Pro

**Files:**
- Create: `apps/web/src/app/api/plans/checkout/route.ts`
- Modify: `apps/web/src/lib/plans-api.ts`
- Test: `apps/web/src/app/api/plans/checkout/route.test.ts`

- [ ] **Step 1: Write failing route tests**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: vi.fn(),
}));

vi.mock("@/lib/plans-api", () => ({
  createPlanCheckout: vi.fn(),
}));

import { POST } from "./route";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { createPlanCheckout } from "@/lib/plans-api";

describe("POST /api/plans/checkout", () => {
  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(getCurrentAppUserFromCookies).mockResolvedValue(null);
    const response = await POST(
      new Request("http://localhost/api/plans/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: "pro" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns checkoutUrl and purchaseId for valid payload", async () => {
    vi.mocked(getCurrentAppUserFromCookies).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(createPlanCheckout).mockResolvedValue({
      checkoutUrl: "https://mp.example/checkout",
      purchaseId: "purchase_123",
    });
    const response = await POST(
      new Request("http://localhost/api/plans/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: "pro", adaptationId: "a1" }),
      }),
    );
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter web test apps/web/src/app/api/plans/checkout/route.test.ts`
Expected: FAIL (route file missing and/or assertions failing).

- [ ] **Step 3: Implement API route and client helper contract**

```ts
// apps/web/src/app/api/plans/checkout/route.ts
import { NextResponse } from "next/server";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { createPlanCheckout } from "@/lib/plans-api";

const VALID_PLAN_IDS = ["starter", "pro", "turbo"] as const;

export async function POST(request: Request) {
  const user = await getCurrentAppUserFromCookies();
  if (!user) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const payload = (await request.json().catch(() => ({}))) as {
    planId?: string;
    adaptationId?: string;
  };

  if (!payload.planId || !VALID_PLAN_IDS.includes(payload.planId as never)) {
    return NextResponse.json({ message: "plano-invalido" }, { status: 400 });
  }

  try {
    const result = await createPlanCheckout(
      payload.planId as "starter" | "pro" | "turbo",
      payload.adaptationId?.trim() || undefined,
    );
    return NextResponse.json({ checkoutUrl: result.checkoutUrl, purchaseId: result.purchaseId });
  } catch {
    return NextResponse.json({ message: "checkout-failed" }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter web test apps/web/src/app/api/plans/checkout/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/plans/checkout/route.ts apps/web/src/app/api/plans/checkout/route.test.ts docs/superpowers/plans/2026-05-11-mercadopago-pro-pre-redirect-warning-implementation.md
git commit -m "feat(web): add json endpoint for plan checkout pre-redirect flow"
```

### Task 2: Implementar modal de confirmacao + abertura em nova aba + redirect

**Files:**
- Modify: `apps/web/src/app/planos/page.tsx`
- Modify: `apps/web/src/app/planos/page.test.tsx` (criar se nao existir)
- Modify: `apps/web/src/app/template.journey-tracking.spec.tsx`

- [ ] **Step 1: Write failing UI test for confirmation flow**

```ts
it("shows confirmation before opening Mercado Pago and redirects to pending page", async () => {
  render(<PlanosPage />);
  await user.click(screen.getByRole("button", { name: /comprar pacote pro/i }));
  expect(screen.getByText(/sera redirecionado para o mercado pago/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run UI test and verify failure**

Run: `pnpm --filter web test apps/web/src/app/planos/page.test.tsx`
Expected: FAIL (modal and JS flow not implemented).

- [ ] **Step 3: Implement client submit flow in plans page**

```tsx
// key behavior to implement in planos/page.tsx
// 1) intercept submit for paid plans
// 2) call POST /api/plans/checkout JSON
// 3) show confirmation modal
// 4) on confirm: window.open(checkoutUrl, "_blank", "noopener,noreferrer")
// 5) if popup blocked, show error
// 6) router.push(`/pagamento/pendente?checkoutId=${purchaseId}`)
```

- [ ] **Step 4: Add copy and popup-blocked fallback UI**

```tsx
// modal copy (exact intent)
// - Você será redirecionado para o Mercado Pago para concluir o pagamento.
// - Após pagar, volte ao EarlyCV para aguardar a efetivação.
// - A confirmação pode levar alguns minutos.
```

- [ ] **Step 5: Update journey tracking test expectations**

Run: `pnpm --filter web test apps/web/src/app/template.journey-tracking.spec.tsx`
Expected: PASS with unchanged tracking events for `plan_selected` and `checkout_started`.

- [ ] **Step 6: Run page tests and verify pass**

Run: `pnpm --filter web test apps/web/src/app/planos/page.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/planos/page.tsx apps/web/src/app/planos/page.test.tsx apps/web/src/app/template.journey-tracking.spec.tsx
git commit -m "feat(web): add pre-redirect confirmation for Pro checkout"
```

### Task 3: Ajustar tela de pendente para orientar retorno e reabertura

**Files:**
- Modify: `apps/web/src/app/pagamento/pendente/page.tsx`
- Modify: `apps/web/src/app/pagamento/pendente/page.test.tsx`

- [ ] **Step 1: Write failing test for guidance copy and reopen CTA**

```ts
it("shows guidance to complete payment in Mercado Pago and allows reopening checkout", async () => {
  render(<PendingPage />);
  expect(screen.getByText(/conclua o pagamento no mercado pago/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /abrir pagamento novamente/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run pending page test and verify failure**

Run: `pnpm --filter web test apps/web/src/app/pagamento/pendente/page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement waiting-state copy alignment**

```tsx
// adjust waiting text to:
// - concluir no MP (aba aberta)
// - efetivacao em alguns minutos
// - manter CTA de reabrir pagamento
```

- [ ] **Step 4: Run pending page tests and verify pass**

Run: `pnpm --filter web test apps/web/src/app/pagamento/pendente/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/pagamento/pendente/page.tsx apps/web/src/app/pagamento/pendente/page.test.tsx
git commit -m "chore(web): clarify pending payment guidance for MP return"
```

### Task 4: Verificacao final integrada

**Files:**
- Modify: none expected (unless fixing regressions)

- [ ] **Step 1: Run targeted web tests**

Run: `pnpm --filter web test apps/web/src/app/api/plans/checkout/route.test.ts apps/web/src/app/planos/page.test.tsx apps/web/src/app/pagamento/pendente/page.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run lint/typecheck for web**

Run: `pnpm --filter web lint && pnpm --filter web typecheck`
Expected: No errors.

- [ ] **Step 3: Manual verification checklist**

```text
1) Logado, clique em Comprar pacote Pro em /planos
2) Modal aparece com instrucoes de redirecionamento e efetivacao
3) Confirmar abre MP em nova aba
4) Aba atual vai para /pagamento/pendente?checkoutId=<id>
5) Tela mostra orientacao e opcao de reabrir checkout
```

- [ ] **Step 4: Commit fixes (if any)**

```bash
git add -A
git commit -m "test(web): validate mp pro pre-redirect checkout flow"
```
