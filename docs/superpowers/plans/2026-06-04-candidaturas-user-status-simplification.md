# Candidaturas User Status Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplificar os status visiveis ao usuario nas rotas de candidaturas, mantendo os tipos internos atuais e expondo apenas o conjunto canonico aprovado na interface.

**Architecture:** A implementacao deve introduzir uma camada de apresentacao que mapeia status internos para labels e opcoes canonicas de UX, sem alterar enums persistidos na API. Essa camada deve ser reutilizada por badges, filtros, stepper, selects e CTAs das telas `/candidaturas` e `/candidaturas/[id]`, agrupando `IN_PROCESS`, `ASSESSMENT` e `OFFER` sob `Em entrevista` na UI.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Testing Library.

---

### Task 1: Centralizar o mapeamento canonico de status de UX

**Files:**
- Modify: `apps/web/src/lib/job-application-status.ts`
- Test: `apps/web/src/app/candidaturas/candidaturas.test.tsx`

- [ ] **Step 1: Write the failing tests for canonical status labels**

Adicione testes em `apps/web/src/app/candidaturas/candidaturas.test.tsx` que capturem o novo vocabulário de UX. Inclua pelo menos estes casos:

```ts
it("maps CV_READY to the CV Liberado label", () => {
  const apps = [makeApp({ id: "cv-ready-1", status: "CV_READY" })];

  render(<CandidaturasClient initialApplications={apps} header={null} />);

  expect(screen.getByText("CV Liberado")).toBeInTheDocument();
});

it("maps APPLIED to the Candidatado label", () => {
  const apps = [makeApp({ id: "applied-1", status: "APPLIED" })];

  render(<CandidaturasClient initialApplications={apps} header={null} />);

  expect(screen.getByText("Candidatado")).toBeInTheDocument();
});

it("maps REJECTED and WITHDRAWN to approved semantic labels", () => {
  const apps = [
    makeApp({ id: "rejected-1", status: "REJECTED" }),
    makeApp({ id: "withdrawn-1", status: "WITHDRAWN" }),
  ];

  render(<CandidaturasClient initialApplications={apps} header={null} />);

  expect(screen.getByText("Recusado")).toBeInTheDocument();
  expect(screen.getByText("Desistência")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the targeted UI test file to verify it fails**

Run: `npm run test:ui -- "src/app/candidaturas/candidaturas.test.tsx"`

Expected: FAIL because current labels still render `CV pronto`, `Enviada`, `Recusada` and `Desisti`.

- [ ] **Step 3: Add canonical UX helpers to the shared status module**

In `apps/web/src/lib/job-application-status.ts`, keep the internal enum keys intact but update labels and add helpers for grouping internal statuses into the new UX vocabulary.

Expected code shape:

```ts
export type UserVisibleStatusKey =
  | "SAVED"
  | "ANALYZED"
  | "CV_READY"
  | "APPLIED"
  | "INTERVIEW"
  | "HIRED"
  | "REJECTED"
  | "WITHDRAWN";

export function getUserVisibleStatus(status: JobApplicationStatus): UserVisibleStatusKey {
  if (status === "IN_PROCESS" || status === "ASSESSMENT" || status === "OFFER") {
    return "INTERVIEW";
  }

  return status as UserVisibleStatusKey;
}
```

Also update labels in `STATUS_CONFIG`:

```ts
CV_READY: { label: "CV Liberado", ... }
APPLIED: { label: "Candidatado", ... }
INTERVIEW: { label: "Em entrevista", ... }
REJECTED: { label: "Recusado", ... }
WITHDRAWN: { label: "Desistência", ... }
```

Do not remove internal keys `IN_PROCESS`, `ASSESSMENT`, `OFFER`; leave them present but prepare them to be grouped in UI later.

- [ ] **Step 4: Run the targeted UI test file to verify labels now pass**

Run: `npm run test:ui -- "src/app/candidaturas/candidaturas.test.tsx"`

Expected: the new label assertions pass; unrelated pre-existing suite failures may still remain.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/job-application-status.ts apps/web/src/app/candidaturas/candidaturas.test.tsx
git commit -m "refactor(candidaturas): centralize canonical user status labels"
```

### Task 2: Limitar as opcoes selecionaveis na detail aos status aprovados

**Files:**
- Modify: `apps/web/src/app/candidaturas/[id]/detail-client.tsx`
- Test: `apps/web/src/app/candidaturas/candidaturas.test.tsx`

- [ ] **Step 1: Write failing tests for the status editor options**

Add tests in `apps/web/src/app/candidaturas/candidaturas.test.tsx` that open the status editor in the detail flow and assert only the approved options appear.

Test shape:

```ts
it("shows only the approved user-facing status options", async () => {
  const app = makeDetail({ status: "APPLIED" });
  render(<DetailClient application={app} header={null} />);

  fireEvent.click(screen.getByRole("button", { name: /editar status/i }));

  const select = screen.getByRole("combobox");
  const optionLabels = Array.from(select.querySelectorAll("option")).map(
    (option) => option.textContent,
  );

  expect(optionLabels).toEqual([
    "Salva",
    "Analisada",
    "CV Liberado",
    "Candidatado",
    "Em entrevista",
    "Contratado",
    "Recusado",
    "Desistência",
  ]);
});
```

- [ ] **Step 2: Run the targeted test file to verify it fails**

Run: `npm run test:ui -- "src/app/candidaturas/candidaturas.test.tsx"`

Expected: FAIL because current editor still exposes legacy options like `Em processo`, `Teste / case` and `Oferta`.

- [ ] **Step 3: Implement a canonical status options list in the detail editor**

In `apps/web/src/app/candidaturas/[id]/detail-client.tsx`, replace direct usage of `ALL_STATUSES` in user-editable surfaces with a dedicated canonical options list.

Expected code shape:

```ts
const USER_VISIBLE_STATUS_OPTIONS: Array<{
  value: JobApplicationStatus;
  label: string;
}> = [
  { value: "SAVED", label: "Salva" },
  { value: "ANALYZED", label: "Analisada" },
  { value: "CV_READY", label: "CV Liberado" },
  { value: "APPLIED", label: "Candidatado" },
  { value: "INTERVIEW", label: "Em entrevista" },
  { value: "HIRED", label: "Contratado" },
  { value: "REJECTED", label: "Recusado" },
  { value: "WITHDRAWN", label: "Desistência" },
];
```

Use this list only for the user-facing selector. Do not remove internal support for other statuses elsewhere yet.

- [ ] **Step 4: Run the targeted test file to verify the selector matches the approved set**

Run: `npm run test:ui -- "src/app/candidaturas/candidaturas.test.tsx"`

Expected: the new selector-options assertion passes; unrelated suite failures may remain.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/candidaturas/[id]/detail-client.tsx apps/web/src/app/candidaturas/candidaturas.test.tsx
git commit -m "fix(candidaturas): limit status editor to canonical user options"
```

### Task 3: Agrupar estados internos sob `Em entrevista` nas superficies de UI

**Files:**
- Modify: `apps/web/src/lib/job-application-status.ts`
- Modify: `apps/web/src/app/candidaturas/candidaturas-client.tsx`
- Modify: `apps/web/src/app/candidaturas/[id]/detail-client.tsx`
- Test: `apps/web/src/app/candidaturas/candidaturas.test.tsx`

- [ ] **Step 1: Write failing tests for grouped presentation**

Add tests that verify `IN_PROCESS`, `ASSESSMENT`, and `OFFER` are presented to the user as `Em entrevista` in both list and detail UI.

```ts
it("groups IN_PROCESS, ASSESSMENT, and OFFER under Em entrevista in the list", () => {
  const apps = [
    makeApp({ id: "process-1", status: "IN_PROCESS" }),
    makeApp({ id: "assessment-1", status: "ASSESSMENT" }),
    makeApp({ id: "offer-1", status: "OFFER" }),
  ];

  render(<CandidaturasClient initialApplications={apps} header={null} />);

  expect(screen.getAllByText("Em entrevista")).toHaveLength(3);
  expect(screen.queryByText("Em processo")).toBeNull();
  expect(screen.queryByText("Teste / case")).toBeNull();
  expect(screen.queryByText("Oferta")).toBeNull();
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm run test:ui -- "src/app/candidaturas/candidaturas.test.tsx"`

Expected: FAIL because legacy labels are still exposed.

- [ ] **Step 3: Route all user-facing status presentation through the canonical mapper**

Use `getUserVisibleStatus()` inside `getStatusConfig()` or add a dedicated presentation helper so badges and grouped UI surfaces resolve to the canonical label before rendering.

Expected safe approach:

```ts
export function getStatusConfig(status: string): StatusConfig {
  const visibleStatus = getUserVisibleStatus(status as JobApplicationStatus);
  return STATUS_CONFIG[visibleStatus] ?? DEFAULT_STATUS_CONFIG;
}
```

This ensures `IN_PROCESS`, `ASSESSMENT`, and `OFFER` reuse the `INTERVIEW` presentation in UI while keeping stored values unchanged.

- [ ] **Step 4: Run the targeted tests to verify grouped labels now pass**

Run: `npm run test:ui -- "src/app/candidaturas/candidaturas.test.tsx"`

Expected: the grouping assertions pass; unrelated pre-existing suite failures may remain.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/job-application-status.ts apps/web/src/app/candidaturas/candidaturas-client.tsx apps/web/src/app/candidaturas/[id]/detail-client.tsx apps/web/src/app/candidaturas/candidaturas.test.tsx
git commit -m "fix(candidaturas): group legacy pipeline statuses under interview"
```

### Task 4: Simplificar stepper, subtitle e copy contextual da detail

**Files:**
- Modify: `apps/web/src/app/candidaturas/[id]/detail-client.tsx`
- Test: `apps/web/src/app/candidaturas/candidaturas.test.tsx`

- [ ] **Step 1: Write failing tests for detail copy simplification**

Add assertions that the detail journey and summary copy use the approved vocabulary.

Examples:

```ts
it("shows Candidatado instead of Enviada in detail UI", () => {
  const app = makeDetail({ status: "APPLIED" });
  render(<DetailClient application={app} header={null} />);

  expect(screen.getByText("Candidatado")).toBeInTheDocument();
  expect(screen.queryByText("Enviada")).toBeNull();
});

it("shows Em entrevista when persisted status is OFFER", () => {
  const app = makeDetail({ status: "OFFER" });
  render(<DetailClient application={app} header={null} />);

  expect(screen.getByText("Em entrevista")).toBeInTheDocument();
  expect(screen.queryByText("Oferta")).toBeNull();
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm run test:ui -- "src/app/candidaturas/candidaturas.test.tsx"`

Expected: FAIL because journey labels and copy still use legacy names.

- [ ] **Step 3: Update stepper and subtitle copy to the canonical UX vocabulary**

In `apps/web/src/app/candidaturas/[id]/detail-client.tsx`:

- rename `CV liberado` label capitalization consistently if needed
- rename `Enviada` to `Candidatado`
- rename `Entrevista` to `Em entrevista`
- make `getJornadaSubtitle()` group `IN_PROCESS`, `ASSESSMENT`, and `OFFER` into a single interview-oriented message

Expected mapping example:

```ts
const map: Record<string, string> = {
  SAVED: "aguardando análise",
  ANALYZED: "análise concluída",
  CV_READY: "CV liberado para candidatura",
  APPLIED: "candidatura realizada",
  IN_PROCESS: "em entrevista",
  INTERVIEW: "em entrevista",
  ASSESSMENT: "em entrevista",
  OFFER: "em entrevista",
  HIRED: "contratado",
  REJECTED: "recusado",
  WITHDRAWN: "desistência registrada",
};
```

Keep the future popup behavior out of scope; this task is copy and presentation only.

- [ ] **Step 4: Run the targeted tests to verify the detail copy now passes**

Run: `npm run test:ui -- "src/app/candidaturas/candidaturas.test.tsx"`

Expected: new assertions pass; unrelated pre-existing suite failures may remain.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/candidaturas/[id]/detail-client.tsx apps/web/src/app/candidaturas/candidaturas.test.tsx
git commit -m "fix(candidaturas): simplify detail status copy"
```

### Task 5: Ajustar filtros e CTAs da listagem para o modelo simplificado

**Files:**
- Modify: `apps/web/src/app/candidaturas/candidaturas-client.tsx`
- Test: `apps/web/src/app/candidaturas/candidaturas.test.tsx`

- [ ] **Step 1: Write failing tests for simplified list filters and CTA copy**

Add tests that verify the list no longer exposes legacy process concepts in user-facing labels.

Examples:

```ts
it("uses simplified filter wording for interview-stage applications", () => {
  render(<CandidaturasClient initialApplications={[makeApp({ status: "INTERVIEW" })]} header={null} />);

  expect(screen.getByText("Em entrevista")).toBeInTheDocument();
  expect(screen.queryByText("Em processo")).toBeNull();
});
```

If CTA wording needs simplification, write a separate test for the approved copy.

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm run test:ui -- "src/app/candidaturas/candidaturas.test.tsx"`

Expected: FAIL where the list still shows legacy labels or category names.

- [ ] **Step 3: Apply the minimal list UI copy changes**

In `apps/web/src/app/candidaturas/candidaturas-client.tsx`:

- revise `FILTERS` labels if they still expose outdated semantics
- revise `ctaForStatus()` only where necessary to keep copy aligned with the simplified status model
- avoid changing business logic or navigation rules beyond wording/grouping

Keep the implementation minimal; do not invent new states or flows.

- [ ] **Step 4: Run the targeted tests to verify the list UI is aligned**

Run: `npm run test:ui -- "src/app/candidaturas/candidaturas.test.tsx"`

Expected: list wording assertions pass; unrelated pre-existing suite failures may remain.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/candidaturas/candidaturas-client.tsx apps/web/src/app/candidaturas/candidaturas.test.tsx
git commit -m "fix(candidaturas): align list filters and CTAs with canonical statuses"
```

### Task 6: Verification of the impacted scope

**Files:**
- Modify: none required

- [ ] **Step 1: Run web check**

Run: `npm run check --workspace @earlycv/web`

Expected: PASS, or documentation of the first unrelated pre-existing failure encountered.

- [ ] **Step 2: Run targeted candidaturas UI tests**

Run: `npm run test:ui -- "src/app/candidaturas/candidaturas.test.tsx"`

Expected: candidaturas assertions for status simplification pass; any remaining failures must be reported exactly.

- [ ] **Step 3: Run targeted detail UI tests if the environment allows it**

Run: `npm run test:ui -- "src/app/candidaturas/[id]/detail-client.test.tsx"`

Expected: PASS, or exact report of any pre-existing `server-only` / mocking blocker already known in this workspace.

- [ ] **Step 4: Run repo-required verification before handoff**

Run: `npm run check && npm run generate --workspace @earlycv/database && npm run build && npm run test`

Expected: PASS in all commands, or exact documentation of the first failing pre-existing blocker outside this feature.

- [ ] **Step 5: Commit**

```bash
git status
```

If no extra changes were needed during verification, do not create a new commit in this task.
