# Dashboard Candidatura CV Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar unlock e download de CV adaptado no card da rota `/dashboard/candidaturas/[id]`, com redirecionamento para compra quando sem credito, sem regressao no fluxo de `/adaptar/resultado`.

**Architecture:** Extrair regras puras de montagem de URL de compra para um helper compartilhado e integrar esse helper no detalhe da candidatura. O estado de UI (loading, erro, sucesso e downloads) permanece local a cada tela. O fluxo de resultado existente continua funcionalmente inalterado.

**Tech Stack:** Next.js App Router, React Client Components, TypeScript, Vitest/Jest testing stack do workspace web.

---

### Task 1: Baseline e protecao de regressao

**Files:**
- Modify: `apps/web/src/app/dashboard/candidaturas/[id]/detail-client.tsx`
- Test: `apps/web/src/app/dashboard/history-action-links.test.tsx`
- Test: `apps/web/src/app/adaptar/resultado/page.unlock-events.test.tsx`

- [ ] **Step 1: Rodar testes existentes que cobrem unlock/compra atual**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/dashboard/history-action-links.test.tsx apps/web/src/app/adaptar/resultado/page.unlock-events.test.tsx`
Expected: PASS (baseline verde antes de mexer).

- [ ] **Step 2: Confirmar estado atual do card CV ADAPTADO**

Verificar no arquivo `apps/web/src/app/dashboard/candidaturas/[id]/detail-client.tsx` que o bloco atual possui:

```tsx
{latest.isUnlocked ? (
  <Link href={`/adaptar/resultado?adaptationId=${latest.id}`}>Ver resultado</Link>
) : (
  <p>AGUARDANDO DESBLOQUEIO</p>
)}
```

Expected: bloco encontrado para substituir de forma controlada na Task 4.

- [ ] **Step 3: Commit de checkpoint de baseline (sem mudanca de codigo)**

```bash
git add -A
git commit -m "chore: capture unlock flow baseline checks"
```

Expected: commit apenas se houver artefatos intencionais (se nao houver mudanca, pular commit).

### Task 2: Criar helper compartilhado de URL de compra

**Files:**
- Create: `apps/web/src/lib/cv-unlock-flow.ts`
- Create: `apps/web/src/lib/cv-unlock-flow.test.ts`

- [ ] **Step 1: Escrever testes falhando para helper**

Criar `apps/web/src/lib/cv-unlock-flow.test.ts` com:

```ts
import { describe, expect, it } from "vitest";
import { buildCvUnlockPlansHref } from "./cv-unlock-flow";

describe("buildCvUnlockPlansHref", () => {
  it("builds minimal URL with aid, source and next", () => {
    const href = buildCvUnlockPlansHref({
      adaptationId: "adp_123",
      source: "dashboard-candidatura-unlock",
      nextPath: "/dashboard/candidaturas/cmp_1",
    });

    expect(href).toBe(
      "/planos?aid=adp_123&source=dashboard-candidatura-unlock&next=%2Fdashboard%2Fcandidaturas%2Fcmp_1",
    );
  });

  it("appends sanitized kw values", () => {
    const href = buildCvUnlockPlansHref({
      adaptationId: "adp_123",
      source: "resultado-buy-credits",
      nextPath: "/dashboard/candidaturas/cmp_1",
      keywords: [" sql ", "", "python"],
    });

    expect(href).toContain("kw=sql");
    expect(href).toContain("kw=python");
    expect(href).not.toContain("kw=%20");
  });

  it("falls back to /planos when adaptationId is empty", () => {
    const href = buildCvUnlockPlansHref({
      adaptationId: "",
      source: "dashboard-candidatura-unlock",
      nextPath: "/dashboard/candidaturas/cmp_1",
    });

    expect(href).toBe("/planos");
  });
});
```

- [ ] **Step 2: Rodar teste novo e validar falha**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/lib/cv-unlock-flow.test.ts`
Expected: FAIL com modulo/funcao inexistente.

- [ ] **Step 3: Implementar helper minimo**

Criar `apps/web/src/lib/cv-unlock-flow.ts` com:

```ts
type BuildCvUnlockPlansHrefInput = {
  adaptationId: string | null | undefined;
  source: string;
  nextPath?: string;
  keywords?: string[];
};

export function buildCvUnlockPlansHref({
  adaptationId,
  source,
  nextPath,
  keywords,
}: BuildCvUnlockPlansHrefInput): string {
  const aid = adaptationId?.trim() ?? "";
  if (!aid) return "/planos";

  const params = new URLSearchParams({
    aid,
    source,
  });

  const next = nextPath?.trim();
  if (next) params.set("next", next);

  for (const rawKeyword of keywords ?? []) {
    const keyword = rawKeyword.trim();
    if (keyword) params.append("kw", keyword);
  }

  return `/planos?${params.toString()}`;
}
```

- [ ] **Step 4: Rodar teste do helper e validar sucesso**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/lib/cv-unlock-flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit do helper compartilhado**

```bash
git add apps/web/src/lib/cv-unlock-flow.ts apps/web/src/lib/cv-unlock-flow.test.ts
git commit -m "feat(web): add shared cv unlock plans url helper"
```

### Task 3: Integrar helper no fluxo de resultado sem regressao

**Files:**
- Modify: `apps/web/src/app/adaptar/resultado/page.tsx`
- Test: `apps/web/src/app/adaptar/resultado/page.unlock-events.test.tsx`

- [ ] **Step 1: Escrever/ajustar teste para garantir URL de compra continua equivalente**

No arquivo `apps/web/src/app/adaptar/resultado/page.unlock-events.test.tsx`, manter/fortalecer assertivas:

```ts
expect(href).toContain("/planos");
expect(href).toContain("aid=");
expect(href).toContain("source=resultado-buy-credits");
expect(href).toContain("kw=sql");
```

- [ ] **Step 2: Rodar teste de resultado e validar baseline/falha esperada**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/adaptar/resultado/page.unlock-events.test.tsx`
Expected: PASS se so reforcou asserts; ou FAIL temporario se a extracao exigir ajuste.

- [ ] **Step 3: Substituir construcao inline por helper (mudanca mecanica)**

Em `apps/web/src/app/adaptar/resultado/page.tsx`, trocar bloco de `planosBuyCreditsHref` para uso do helper:

```ts
const planosBuyCreditsHref = buildCvUnlockPlansHref({
  adaptationId: reviewAdaptationId,
  source: "resultado-buy-credits",
  keywords: Array.from(effectiveSelected),
});
```

Import:

```ts
import { buildCvUnlockPlansHref } from "@/lib/cv-unlock-flow";
```

- [ ] **Step 4: Rodar testes de resultado e validar ausencia de regressao**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/adaptar/resultado/page.unlock-events.test.tsx`
Expected: PASS com comportamento funcional igual.

- [ ] **Step 5: Commit da integracao segura em resultado**

```bash
git add apps/web/src/app/adaptar/resultado/page.tsx apps/web/src/app/adaptar/resultado/page.unlock-events.test.tsx
git commit -m "refactor(web): reuse shared plans href builder in resultado unlock"
```

### Task 4: Implementar unlock/download no card de candidatura

**Files:**
- Modify: `apps/web/src/app/dashboard/candidaturas/[id]/detail-client.tsx`
- Test: `apps/web/src/app/dashboard/candidaturas/[id]/detail-client.test.tsx`

- [ ] **Step 1: Criar testes falhando para estados do card CV ADAPTADO**

Criar `apps/web/src/app/dashboard/candidaturas/[id]/detail-client.test.tsx` cobrindo:

```tsx
it("shows unlock button when adaptation is locked", () => {
  // render with latest.isUnlocked = false
  expect(screen.getByRole("button", { name: /liberar cv/i })).toBeInTheDocument();
});

it("shows plans link with aid/source/next when no credits", () => {
  // render locked + no credit
  const link = screen.getByRole("link", { name: /liberar cv/i });
  expect(link.getAttribute("href")).toContain("/planos?");
  expect(link.getAttribute("href")).toContain("aid=");
  expect(link.getAttribute("href")).toContain("source=dashboard-candidatura-unlock");
  expect(link.getAttribute("href")).toContain("next=%2Fdashboard%2Fcandidaturas%2F");
});

it("shows download actions when unlocked", () => {
  // render with latest.isUnlocked = true
  expect(screen.getByRole("button", { name: /baixar pdf/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /baixar docx/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar testes novos e validar falha inicial**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/dashboard/candidaturas/[id]/detail-client.test.tsx`
Expected: FAIL pelos novos comportamentos ainda nao implementados.

- [ ] **Step 3: Implementar estado e CTAs no `CvAdaptadoCard`**

No `detail-client.tsx`:

```tsx
const plansHref = buildCvUnlockPlansHref({
  adaptationId: latest.id,
  source: "dashboard-candidatura-unlock",
  nextPath: `/dashboard/candidaturas/${applicationId}`,
});

if (latest.isUnlocked || wasUnlockedInSession) {
  return (
    <>
      <button type="button" onClick={() => handleDownload("pdf")}>Baixar PDF</button>
      <button type="button" onClick={() => handleDownload("docx")}>Baixar DOCX</button>
    </>
  );
}

return hasCredits ? (
  <button type="button" onClick={handleRedeem}>Liberar CV</button>
) : (
  <Link href={plansHref}>Liberar CV</Link>
);
```

Regras:
- loading label `Liberando...` enquanto redeem in-flight;
- erro exibido no card, sem quebrar estrutura;
- sucesso faz refresh local do estado para liberar downloads.

- [ ] **Step 4: Implementar handlers de redeem/download com contrato existente**

No mesmo arquivo:

```ts
const redeemHref = `/api/cv-adaptation/${latest.id}/redeem-credit`;
const response = await fetch(redeemHref, { method: "POST", cache: "no-store" });
if (!response.ok) throw new Error("Falha ao liberar CV");
setWasUnlockedInSession(true);
```

Downloads devem reutilizar endpoint/fluxo ja utilizado no dashboard historico (mesmo formato pdf/docx e overlay bloqueante).

- [ ] **Step 5: Rodar testes do detalhe da candidatura**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/dashboard/candidaturas/[id]/detail-client.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit da feature no detalhe da candidatura**

```bash
git add apps/web/src/app/dashboard/candidaturas/[id]/detail-client.tsx apps/web/src/app/dashboard/candidaturas/[id]/detail-client.test.tsx
git commit -m "feat(web): add cv unlock and download actions in candidatura detail"
```

### Task 5: Validacao cruzada e verificacao final

**Files:**
- Modify: (nenhum obrigatorio)
- Test: `apps/web/src/app/dashboard/candidaturas/[id]/detail-client.test.tsx`
- Test: `apps/web/src/app/adaptar/resultado/page.unlock-events.test.tsx`
- Test: `apps/web/src/app/dashboard/history-action-links.test.tsx`

- [ ] **Step 1: Rodar suite focada do web para fluxos afetados**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/dashboard/candidaturas/[id]/detail-client.test.tsx apps/web/src/app/adaptar/resultado/page.unlock-events.test.tsx apps/web/src/app/dashboard/history-action-links.test.tsx apps/web/src/lib/cv-unlock-flow.test.ts`
Expected: PASS.

- [ ] **Step 2: Rodar check do workspace web**

Run: `npm run check --workspace @earlycv/web`
Expected: PASS (lint/type/check sem erros).

- [ ] **Step 3: Rodar verificacao obrigatoria do projeto no escopo definido pelo time**

Run: `npm run check && npm run generate --workspace @earlycv/database && npm run build && npm run test`
Expected: PASS.

- [ ] **Step 4: Commit final de estabilizacao (se houver ajuste pos-verificacao)**

```bash
git add -A
git commit -m "test(web): cover candidatura unlock flow and protect resultado behavior"
```

Expected: commit apenas se existirem mudancas intencionais.
