# Meu Perfil + Meu CV Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar `/meu-perfil` como hub de navegação e `/meu-cv-master` como tela de edição do UserProfile e do CV Master, mantendo `/dashboard` como redirect.

**Architecture:** O trabalho será feito em camadas pequenas. Primeiro, criaremos a nova rota hub e o redirect; depois, construiremos a tela de edição com blocos colapsáveis e foco por lacuna; por fim, ajustaremos menu, onboarding e links para manter o fluxo coerente.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS v4, Server Components, Client Components, APIs já existentes de profiles/resumes, Biome e testes do workspace web.

---

### Arquivos-alvo

- `apps/web/src/app/dashboard/page.tsx` - redirect técnico para `/meu-perfil`
- `apps/web/src/app/meu-perfil/page.tsx` - nova tela hub pós-login
- `apps/web/src/app/meu-cv-master/page.tsx` - nova tela de edição do perfil e CV Master
- `apps/web/src/app/meu-cv-master/*.tsx` - componentes de blocos colapsáveis e edição inline
- `apps/web/src/components/app-header.tsx` - ajuste de label/link do menu se necessário
- `apps/web/src/lib/*.ts` - helpers para perfil, status e navegação
- `apps/web/src/app/**/**/*.test.tsx` - testes de rotas, renderização e fluxo

---

### Task 1: Redirecionar `/dashboard` e criar o hub `/meu-perfil`

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Create: `apps/web/src/app/meu-perfil/page.tsx`
- Test: `apps/web/src/app/meu-perfil/page.test.tsx`
- Test: `apps/web/src/app/dashboard/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import MeuPerfilPage from "./page";

it("renders the hub actions and not edit forms", () => {
  render(<MeuPerfilPage />);

  expect(screen.getByRole("heading", { name: /meu perfil/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /adaptar cv/i })).toBeInTheDocument();
  expect(screen.queryByLabelText(/nome/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/meu-perfil/page.test.tsx -v`
Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
import Link from "next/link";

export default function MeuPerfilPage() {
  return (
    <main>
      <h1>Meu Perfil</h1>
      <Link href="/adaptar">Adaptar CV</Link>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/meu-perfil/page.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/page.tsx apps/web/src/app/meu-perfil/page.tsx apps/web/src/app/meu-perfil/page.test.tsx apps/web/src/app/dashboard/page.test.tsx
git commit -m "feat: add meu perfil hub"
```

---

### Task 2: Build `/meu-cv-master` shell with review states

**Files:**
- Create: `apps/web/src/app/meu-cv-master/page.tsx`
- Create: `apps/web/src/app/meu-cv-master/page.test.tsx`
- Create: `apps/web/src/app/meu-cv-master/cv-master-block.tsx`
- Create: `apps/web/src/app/meu-cv-master/cv-master-block.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import MeuCvMasterPage from "./page";

it("renders review blocks and focus target affordances", () => {
  render(<MeuCvMasterPage />);

  expect(screen.getByRole("heading", { name: /meu cv master/i })).toBeInTheDocument();
  expect(screen.getByText(/revisão/i)).toBeInTheDocument();
  expect(screen.getByText(/edição inline/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/meu-cv-master/page.test.tsx -v`
Expected: FAIL because the shell is not implemented.

- [ ] **Step 3: Write minimal implementation**

```tsx
export default function MeuCvMasterPage() {
  return <main><h1>Meu CV Master</h1></main>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/meu-cv-master/page.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/meu-cv-master
git commit -m "feat: add meu cv master shell"
```

---

### Task 3: Map UserProfile fields into edit blocks

**Files:**
- Modify: `apps/web/src/lib/profiles-api.ts` or existing profile helper
- Modify: `apps/web/src/app/meu-cv-master/page.tsx`
- Create: `apps/web/src/app/meu-cv-master/profile-blocks.tsx`
- Test: `apps/web/src/app/meu-cv-master/profile-blocks.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { buildProfileBlocks } from "./profile-blocks";

it("groups user profile data into the expected blocks", () => {
  const blocks = buildProfileBlocks({ fullName: "Ana", phone: "11 99999-9999" });

  expect(blocks[0].id).toBe("basic-data");
  expect(blocks.some((block) => block.id === "contacts")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/meu-cv-master/profile-blocks.test.tsx -v`
Expected: FAIL because the mapper does not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
export function buildProfileBlocks(profile) {
  return [
    { id: "basic-data", title: "Dados básicos" },
    { id: "contacts", title: "Contato" },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/meu-cv-master/profile-blocks.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/meu-cv-master/profile-blocks.tsx apps/web/src/app/meu-cv-master/profile-blocks.test.tsx apps/web/src/lib/profiles-api.ts apps/web/src/app/meu-cv-master/page.tsx
git commit -m "feat: map profile blocks"
```

---

### Task 4: Implement block states and focus-by-lacuna behavior

**Files:**
- Create: `apps/web/src/app/meu-cv-master/editable-section.tsx`
- Create: `apps/web/src/app/meu-cv-master/editable-section.test.tsx`
- Modify: `apps/web/src/app/meu-cv-master/page.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { EditableSection } from "./editable-section";

it("opens only the targeted block", () => {
  render(<EditableSection id="summary" title="Resumo profissional" hasGap />);

  expect(screen.getByRole("button", { name: /resumo profissional/i })).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/meu-cv-master/editable-section.test.tsx -v`
Expected: FAIL because the component is missing.

- [ ] **Step 3: Write minimal implementation**

```tsx
export function EditableSection({ title }) {
  return <button type="button">{title}</button>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/meu-cv-master/editable-section.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/meu-cv-master/editable-section.tsx apps/web/src/app/meu-cv-master/editable-section.test.tsx apps/web/src/app/meu-cv-master/page.tsx
git commit -m "feat: add inline profile sections"
```

---

### Task 5: Wire CV upload, replacement and removal into `/meu-cv-master`

**Files:**
- Modify: `apps/web/src/app/meu-cv-master/page.tsx`
- Modify: `apps/web/src/lib/resumes-api.ts`
- Test: `apps/web/src/app/meu-cv-master/cv-actions.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { CvMasterActions } from "./cv-master-actions";

it("shows upload and remove actions", () => {
  render(<CvMasterActions hasResume />);

  expect(screen.getByRole("button", { name: /substituir cv/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /remover/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/meu-cv-master/cv-actions.test.tsx -v`
Expected: FAIL because the action component is missing.

- [ ] **Step 3: Write minimal implementation**

```tsx
export function CvMasterActions({ hasResume }) {
  return hasResume ? <button>Remover</button> : <button>Enviar CV</button>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/meu-cv-master/cv-actions.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/meu-cv-master/cv-master-actions.tsx apps/web/src/app/meu-cv-master/cv-actions.test.tsx apps/web/src/app/meu-cv-master/page.tsx apps/web/src/lib/resumes-api.ts
git commit -m "feat: wire cv master actions"
```

---

### Task 6: Update menu labels and onboarding entry points

**Files:**
- Modify: `apps/web/src/components/app-header.tsx`
- Modify: `apps/web/src/app/adaptar/page.tsx`
- Modify: `apps/web/src/app/cv-base/page.tsx` if needed for redirects/copy
- Test: `apps/web/src/components/app-header.test.tsx`
- Test: `apps/web/src/app/adaptar/page.submit-flow.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("shows Meu Perfil in the menu and omits Meu CV Master", () => {
  // render header
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/components/app-header.test.tsx -v`
Expected: FAIL because the label is still Dashboard.

- [ ] **Step 3: Write minimal implementation**

```tsx
// rename dashboard label to Meu Perfil and keep edit entry only inside the hub
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/components/app-header.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/app-header.tsx apps/web/src/app/adaptar/page.tsx apps/web/src/app/cv-base/page.tsx apps/web/src/components/app-header.test.tsx apps/web/src/app/adaptar/page.submit-flow.spec.tsx
git commit -m "feat: update profile navigation"
```

---

### Task 7: Verify route guards, redirects and workspace quality

**Files:**
- All touched web files

- [ ] **Step 1: Run targeted tests**

Run: `npm run test --workspace @earlycv/web`
Expected: pass for new/updated route and component tests.

- [ ] **Step 2: Run check**

Run: `npm run check --workspace @earlycv/web`
Expected: no lint/type errors in the web workspace.

- [ ] **Step 3: Run build**

Run: `npm run build --workspace @earlycv/web`
Expected: successful production build.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: split profile hub and cv master"
```

---

### Self-review checklist

- [ ] `/meu-perfil` contains only hub/orientation content
- [ ] `/meu-cv-master` contains the editing experience
- [ ] `/dashboard` redirects
- [ ] the `UserProfile` remains the source for editable profile data
- [ ] CV upload/removal flow remains intact
- [ ] onboarding lands in the edit flow after first CV processing
- [ ] menu exposes `Meu Perfil` but not `Meu CV Master`
