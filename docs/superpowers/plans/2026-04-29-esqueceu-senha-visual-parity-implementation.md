# Paridade Visual Esqueceu Senha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar copia 100% fiel da estrutura visual de `verificar-email` na rota `esqueceu-senha`, mantendo comportamento funcional de recuperacao de senha.

**Architecture:** Extrair um shell visual compartilhado e puramente de apresentacao para fluxos de auth monocromaticos, com API minima (`children`). Migrar `verificar-email` e `esqueceu-senha` para esse shell para garantir consistencia estrutural e evitar drift de estilos futuros.

**Tech Stack:** Next.js App Router, React 19, TypeScript, estilos inline existentes do app, Biome, Vitest/Node test runner.

---

## File Structure

- Create: `apps/web/src/components/auth/auth-mono-shell.tsx`
  - Responsabilidade: encapsular a estrutura visual identica de `verificar-email` (grain, background, bloco de logo com `Logo` + `v1.2`, card).
- Modify: `apps/web/src/app/verificar-email/page.tsx`
  - Responsabilidade: manter guard/redirect e estado server-side, delegando o shell visual ao novo componente compartilhado.
- Modify: `apps/web/src/app/esqueceu-senha/page.tsx`
  - Responsabilidade: preservar estados/submit da pagina client-side, reutilizando shell compartilhado para atingir paridade visual completa.
- Optional Test (se necessario): `apps/web/src/app/esqueceu-senha/page.spec.tsx`
  - Responsabilidade: validar renderizacao basica dos estados principais sem regressao funcional.

### Task 1: Criar shell visual compartilhado de autenticacao

**Files:**
- Create: `apps/web/src/components/auth/auth-mono-shell.tsx`
- Test (manual): `apps/web/src/app/verificar-email/page.tsx`, `apps/web/src/app/esqueceu-senha/page.tsx`

- [ ] **Step 1: Escrever teste de contrato visual minimo (failing)**

```tsx
// apps/web/src/app/esqueceu-senha/page.spec.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/logo", () => ({
  Logo: () => <div data-testid="logo" />,
}));

import EsqueceuSenhaPage from "./page";

describe("EsqueceuSenhaPage", () => {
  it("renderiza header com identidade visual compartilhada", () => {
    render(<EsqueceuSenhaPage />);
    expect(screen.getByTestId("logo")).toBeInTheDocument();
    expect(screen.getByText("v1.2")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar teste e confirmar falha inicial**

Run: `npm run test:ui --workspace @earlycv/web -- apps/web/src/app/esqueceu-senha/page.spec.tsx`

Expected: FAIL com erro de import/componente ainda inexistente ou ausencia de elementos esperados.

- [ ] **Step 3: Implementar componente `AuthMonoShell` com estrutura fiel**

```tsx
// apps/web/src/components/auth/auth-mono-shell.tsx
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { PageShell } from "@/components/page-shell";

type AuthMonoShellProps = {
  children: ReactNode;
  cardMaxWidth?: number;
};

export function AuthMonoShell({
  children,
  cardMaxWidth = 460,
}: AuthMonoShellProps) {
  return (
    <PageShell>
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.45,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
        aria-hidden
      />

      <main
        style={{
          fontFamily: "var(--font-geist), -apple-system, system-ui, sans-serif",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 20px",
          color: "#0a0a0a",
          position: "relative",
        }}
      >
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            marginBottom: 40,
          }}
        >
          <Logo size="lg" />
          <span
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              color: "#8a8a85",
              border: "1px solid #d8d6ce",
              borderRadius: 3,
              padding: "1px 5px",
              fontWeight: 500,
            }}
          >
            v1.2
          </span>
        </a>

        <div
          style={{
            width: "100%",
            maxWidth: cardMaxWidth,
            background: "#fafaf6",
            border: "1px solid rgba(10,10,10,0.08)",
            borderRadius: 18,
            padding: "36px 32px",
            boxShadow: "0 8px 40px -12px rgba(10,10,10,0.12)",
            position: "relative",
            zIndex: 1,
          }}
        >
          {children}
        </div>
      </main>
    </PageShell>
  );
}
```

- [ ] **Step 4: Rodar teste para validar contrato minimo**

Run: `npm run test:ui --workspace @earlycv/web -- apps/web/src/app/esqueceu-senha/page.spec.tsx`

Expected: PASS para presenca de `Logo` e `v1.2`.

- [ ] **Step 5: Commit da task 1**

```bash
git add apps/web/src/components/auth/auth-mono-shell.tsx apps/web/src/app/esqueceu-senha/page.spec.tsx
git commit -m "feat(web): add shared auth shell for mono visual identity"
```

### Task 2: Migrar verificar-email para o shell compartilhado

**Files:**
- Modify: `apps/web/src/app/verificar-email/page.tsx`

- [ ] **Step 1: Escrever teste de regressao de render server/page (failing)**

```ts
// apps/web/src/lib/app-session.spec.ts (adicionar caso)
it("mantem verificar-email como rota acessivel para usuario autenticado nao verificado", () => {
  const user = {
    id: "u1",
    email: "user@earlycv.dev",
    role: "USER",
    emailVerified: false,
  };
  expect(getRouteAccessRedirectPath("/verificar-email", user)).toBeNull();
});
```

Obs: esse teste protege comportamento de rota enquanto o layout e refatorado.

- [ ] **Step 2: Rodar teste para estabelecer baseline**

Run: `npm run test:spec --workspace @earlycv/web -- src/lib/app-session.spec.ts`

Expected: PASS (baseline de regra de acesso sem alterar regra).

- [ ] **Step 3: Refatorar `verificar-email/page.tsx` para usar `AuthMonoShell`**

```tsx
// apps/web/src/app/verificar-email/page.tsx (trecho relevante)
import { AuthMonoShell } from "@/components/auth/auth-mono-shell";

// ...

return (
  <AuthMonoShell>
    <VerifyForm
      next={next}
      isResultFlow={isResultFlow}
      error={params.error}
      resent={params.resent}
      userEmail={user?.email}
    />
  </AuthMonoShell>
);
```

- [ ] **Step 4: Rodar testes de especificacao do web app**

Run: `npm run test:spec --workspace @earlycv/web`

Expected: PASS sem regressao de regras de sessao/auth.

- [ ] **Step 5: Commit da task 2**

```bash
git add apps/web/src/app/verificar-email/page.tsx apps/web/src/lib/app-session.spec.ts
git commit -m "refactor(web): reuse shared auth shell in verify email page"
```

### Task 3: Migrar esqueceu-senha para copia fiel da estrutura visual

**Files:**
- Modify: `apps/web/src/app/esqueceu-senha/page.tsx`

- [ ] **Step 1: Escrever teste de estado de sucesso (failing)**

```tsx
// apps/web/src/app/esqueceu-senha/page.spec.tsx (adicionar caso)
it("mostra estado de sucesso apos submit ok", async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
  render(<EsqueceuSenhaPage />);
  // preencher e submeter...
  expect(await screen.findByText("Email enviado")).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar teste e confirmar falha inicial**

Run: `npm run test:ui --workspace @earlycv/web -- apps/web/src/app/esqueceu-senha/page.spec.tsx`

Expected: FAIL se a interacao ainda nao estiver implementada no teste.

- [ ] **Step 3: Refatorar pagina para usar `AuthMonoShell` mantendo logica de submit/estados**

```tsx
// apps/web/src/app/esqueceu-senha/page.tsx (trecho relevante)
import { AuthMonoShell } from "@/components/auth/auth-mono-shell";

return (
  <AuthMonoShell>
    {status === "done" ? (
      // bloco de sucesso atual, sem alterar comportamento
    ) : (
      // heading, form, feedback de erro e CTA de login
    )}
    <style>{`.entrar-input:focus { border-color: #0a0a0a !important; }`}</style>
  </AuthMonoShell>
);
```

- [ ] **Step 4: Rodar testes UI e check de qualidade do web app**

Run: `npm run test:ui --workspace @earlycv/web -- apps/web/src/app/esqueceu-senha/page.spec.tsx`

Expected: PASS nos cenarios de render e sucesso.

Run: `npm run check --workspace @earlycv/web`

Expected: PASS sem erros de Biome no `src`.

- [ ] **Step 5: Validacao manual de paridade visual em desktop e mobile**

Run: `npm run dev --workspace @earlycv/web`

Checklist manual:
- `/verificar-email` e `/esqueceu-senha` com mesmo shell visual (grain, fundo, logo + `v1.2`, card).
- Card com mesma largura, borda, raio, sombra e padding.
- Fluxo de submit da tela de forgot password continua funcional (loading, sucesso, erro).

- [ ] **Step 6: Commit da task 3**

```bash
git add apps/web/src/app/esqueceu-senha/page.tsx apps/web/src/app/esqueceu-senha/page.spec.tsx
git commit -m "refactor(web): apply verify-email visual shell to forgot password"
```

### Task 4: Verificacao final integrada

**Files:**
- Modify: nenhum (somente verificacao)

- [ ] **Step 1: Rodar suite de testes web completa**

Run: `npm run test --workspace @earlycv/web`

Expected: PASS (`test:spec` e `test:ui`).

- [ ] **Step 2: Rodar lint/check de workspace web**

Run: `npm run lint --workspace @earlycv/web && npm run check --workspace @earlycv/web`

Expected: PASS sem erros.

- [ ] **Step 3: Registrar validacao visual no PR/descricao de entrega**

```md
- Rotas validadas: /verificar-email e /esqueceu-senha
- Paridade visual estrutural confirmada
- Fluxo funcional de forgot password preservado
```

- [ ] **Step 4: Commit final (se houver ajustes de verificacao)**

```bash
git add .
git commit -m "test(web): verify auth visual parity and forgot-password flow"
```

## Self-Review

- Cobertura da spec: todos os requisitos de paridade estrutural, preservacao funcional e validacao desktop/mobile estao mapeados nas Tasks 1-4.
- Placeholder scan: nao ha TBD/TODO; cada etapa possui comando, artefato e criterio esperado.
- Consistencia de nomes: componente central definido como `AuthMonoShell` e usado de forma consistente em todas as tasks.
