# Candidaturas Resume Used Per Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que o popup `Ajustes feitos` em `/candidaturas/[id]` mostre o CV usado na analise correta, por item de `cvAdaptations`, incluindo `CV Master` quando aplicavel.

**Architecture:** A rota server `/candidaturas/[id]` ja enriquece cada analise com dados derivados de `getCvAdaptation(a.id)` e `listMyResumes()`. A implementacao deve formalizar esse enriquecimento no contrato do client com o novo campo `resumeUsedTitle`, renomear o uso na UI do popup e adicionar testes que provem o comportamento por analise individual, incluindo multiplas analises com CVs diferentes.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Testing Library.

---

### Task 1: Formalizar `resumeUsedTitle` no contrato da tela

**Files:**
- Modify: `apps/web/src/lib/job-applications-api.ts:119-136`
- Test: `apps/web/src/app/candidaturas/[id]/detail-client.test.tsx`

- [ ] **Step 1: Write the failing test data shape**

Atualize o fixture base de `buildApplication()` para incluir o novo campo em cada item de `cvAdaptations`.

```ts
cvAdaptations: [
  {
    id: "adp_123",
    status: "completed",
    jobTitle: "Software Engineer",
    companyName: "Acme",
    isUnlocked: false,
    adaptedResumeId: "res_123",
    createdAt: "2026-05-01T00:00:00.000Z",
    scoreBefore: 50,
    scoreAfter: 73,
    canDownloadBaseCv: false,
    resumeUsedTitle: "CV Master",
  },
],
```

- [ ] **Step 2: Run test to verify it fails on missing type field**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/candidaturas/[id]/detail-client.test.tsx`

Expected: FAIL com erro de TypeScript informando que `resumeUsedTitle` nao existe no tipo atual de `cvAdaptations`.

- [ ] **Step 3: Add `resumeUsedTitle` to the detail DTO**

Em `apps/web/src/lib/job-applications-api.ts`, atualize o tipo de `cvAdaptations`:

```ts
  cvAdaptations: Array<{
    id: string;
    status: string;
    jobTitle: string | null;
    companyName: string | null;
    isUnlocked: boolean;
    adaptedResumeId: string | null;
    createdAt: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
    canDownloadBaseCv: boolean;
    resumeUsedTitle: string | null;
  }>;
```

- [ ] **Step 4: Run test to verify the type issue is resolved**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/candidaturas/[id]/detail-client.test.tsx`

Expected: os testes ainda podem falhar por comportamento do popup, mas nao mais por tipo ausente de `resumeUsedTitle`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/job-applications-api.ts apps/web/src/app/candidaturas/[id]/detail-client.test.tsx
git commit -m "refactor: formalize resume title per adaptation"
```

### Task 2: Renomear o enriquecimento server-side para `resumeUsedTitle`

**Files:**
- Modify: `apps/web/src/app/candidaturas/[id]/page.tsx:49-93`
- Test: `apps/web/src/app/candidaturas/[id]/detail-client.test.tsx`

- [ ] **Step 1: Write a failing UI test for the popup context**

Adicione um teste novo que abra `Ajustes feitos` e valide o texto do CV usado na analise.

```ts
it("shows the resume used for the selected analysis", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ creditsRemaining: 1 }),
    })) as unknown as typeof fetch,
  );

  render(
    <DetailClient
      application={buildApplication({
        cvAdaptations: [
          {
            id: "adp_123",
            status: "completed",
            jobTitle: "Software Engineer",
            companyName: "Acme",
            isUnlocked: true,
            adaptedResumeId: "res_123",
            createdAt: "2026-05-01T00:00:00.000Z",
            scoreBefore: 50,
            scoreAfter: 73,
            canDownloadBaseCv: false,
            resumeUsedTitle: "CV Master",
          },
        ],
      })}
      header={<div />}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /ajustes feitos/i }));

  expect(await screen.findByText(/CV usado na análise:/i)).toBeTruthy();
  expect(screen.getByText("CV Master")).toBeTruthy();
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/candidaturas/[id]/detail-client.test.tsx --runInBand`

Expected: FAIL porque a UI ainda le `masterResumeTitle` ou nao encontra o texto esperado.

- [ ] **Step 3: Rename the derived field in the page data mapping**

Em `apps/web/src/app/candidaturas/[id]/page.tsx`, substitua `masterResumeTitle` por `resumeUsedTitle` em toda a cadeia de enriquecimento.

Trechos esperados:

```ts
      const resumeUsedTitle = resumeUsed
        ? (resumeUsed.isMaster ? "CV Master" : resumeUsed.title)
        : null;

      return {
        id: a.id,
        scoreBefore: signal.adjustments.scoreBefore,
        scoreAfter: signal.score,
        notes,
        resumeUsedTitle,
      };
```

```ts
  const scoresById = new Map<
    string,
    {
      scoreBefore: number | null;
      scoreAfter: number | null;
      notes: string | null;
      resumeUsedTitle: string | null;
    }
  >();
```

```ts
      scoresById.set(r.value.id, {
        scoreBefore: r.value.scoreBefore,
        scoreAfter: r.value.scoreAfter,
        notes: r.value.notes,
        resumeUsedTitle: r.value.resumeUsedTitle,
      });
```

```ts
      resumeUsedTitle: scoresById.get(a.id)?.resumeUsedTitle ?? null,
```

- [ ] **Step 4: Run the targeted test to verify the data path is ready**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/candidaturas/[id]/detail-client.test.tsx --runInBand`

Expected: o teste ainda pode falhar se a UI do popup continuar usando o nome antigo, mas o dado server-side ja deve estar coerente.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/candidaturas/[id]/page.tsx apps/web/src/app/candidaturas/[id]/detail-client.test.tsx
git commit -m "refactor: rename adaptation resume title field"
```

### Task 3: Atualizar o popup para ler o campo correto por analise

**Files:**
- Modify: `apps/web/src/app/candidaturas/[id]/detail-client.tsx:1261-1273`
- Test: `apps/web/src/app/candidaturas/[id]/detail-client.test.tsx`

- [ ] **Step 1: Extend the failing tests for non-master and fallback cases**

Adicione dois testes ao arquivo existente.

Caso CV comum:

```ts
it("shows a non-master resume title in the adjustments popup", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ creditsRemaining: 1 }),
    })) as unknown as typeof fetch,
  );

  render(
    <DetailClient
      application={buildApplication({
        cvAdaptations: [
          {
            id: "adp_123",
            status: "completed",
            jobTitle: "Software Engineer",
            companyName: "Acme",
            isUnlocked: true,
            adaptedResumeId: "res_123",
            createdAt: "2026-05-01T00:00:00.000Z",
            scoreBefore: 50,
            scoreAfter: 73,
            canDownloadBaseCv: false,
            resumeUsedTitle: "Meu CV Dados",
          },
        ],
      })}
      header={<div />}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /ajustes feitos/i }));

  expect(await screen.findByText("Meu CV Dados")).toBeTruthy();
});
```

Caso fallback:

```ts
it("shows fallback text when resume used cannot be identified", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ creditsRemaining: 1 }),
    })) as unknown as typeof fetch,
  );

  render(
    <DetailClient
      application={buildApplication({
        cvAdaptations: [
          {
            id: "adp_123",
            status: "completed",
            jobTitle: "Software Engineer",
            companyName: "Acme",
            isUnlocked: true,
            adaptedResumeId: "res_123",
            createdAt: "2026-05-01T00:00:00.000Z",
            scoreBefore: 50,
            scoreAfter: 73,
            canDownloadBaseCv: false,
            resumeUsedTitle: null,
          },
        ],
      })}
      header={<div />}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /ajustes feitos/i }));

  expect(await screen.findByText("Não identificado")).toBeTruthy();
});
```

- [ ] **Step 2: Run the targeted test file and verify failures**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/candidaturas/[id]/detail-client.test.tsx --runInBand`

Expected: FAIL nos testes do popup enquanto `detail-client.tsx` ainda usar `masterResumeTitle`.

- [ ] **Step 3: Update the popup to read `resumeUsedTitle`**

Em `apps/web/src/app/candidaturas/[id]/detail-client.tsx`, altere o bloco do contexto:

```tsx
              <p style={{ fontSize: 13, color: "#0a0a0a", margin: 0 }}>
                <span style={{ fontWeight: 500 }}>CV usado na análise:</span>{" "}
                {adaptation.resumeUsedTitle ?? "Não identificado"}
              </p>
```

- [ ] **Step 4: Run the popup tests and verify they pass**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/candidaturas/[id]/detail-client.test.tsx --runInBand`

Expected: PASS nos testes que cobrem `CV Master`, CV comum e fallback.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/candidaturas/[id]/detail-client.tsx apps/web/src/app/candidaturas/[id]/detail-client.test.tsx
git commit -m "fix: show resume used in adjustments popup"
```

### Task 4: Provar comportamento com multiplas analises na mesma candidatura

**Files:**
- Modify: `apps/web/src/app/candidaturas/[id]/detail-client.test.tsx`

- [ ] **Step 1: Write the failing multi-analysis regression test**

Adicione um teste com duas analises destravadas e titulos diferentes.

```ts
it("shows the correct resume title for each analysis in the same application", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ creditsRemaining: 1 }),
    })) as unknown as typeof fetch,
  );

  render(
    <DetailClient
      application={buildApplication({
        currentCvAdaptationId: "adp_master",
        cvAdaptations: [
          {
            id: "adp_master",
            status: "completed",
            jobTitle: "Software Engineer",
            companyName: "Acme",
            isUnlocked: true,
            adaptedResumeId: "res_master",
            createdAt: "2026-05-02T00:00:00.000Z",
            scoreBefore: 50,
            scoreAfter: 73,
            canDownloadBaseCv: false,
            resumeUsedTitle: "CV Master",
          },
          {
            id: "adp_data",
            status: "completed",
            jobTitle: "Software Engineer",
            companyName: "Acme",
            isUnlocked: true,
            adaptedResumeId: "res_data",
            createdAt: "2026-05-01T00:00:00.000Z",
            scoreBefore: 48,
            scoreAfter: 76,
            canDownloadBaseCv: false,
            resumeUsedTitle: "Meu CV Dados",
          },
        ],
      })}
      header={<div />}
    />,
  );

  const adjustmentButtons = screen.getAllByRole("button", {
    name: /ajustes feitos/i,
  });

  fireEvent.click(adjustmentButtons[0]);
  expect(await screen.findByText("CV Master")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /fechar/i }));

  fireEvent.click(adjustmentButtons[1]);
  expect(await screen.findByText("Meu CV Dados")).toBeTruthy();
});
```

- [ ] **Step 2: Run the regression test and verify failure if selection context is wrong**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/candidaturas/[id]/detail-client.test.tsx --runInBand`

Expected: se ainda houver compartilhamento indevido de contexto entre analises, o teste falha mostrando o titulo errado na segunda abertura.

- [ ] **Step 3: Make the smallest code adjustment only if needed**

Se os passos anteriores ja garantirem leitura por item selecionado, nao altere a logica adicionalmente.

Se houver bug de selecao, ajuste somente a parte que escolhe a `adaptation` aberta para o modal, mantendo o restante intacto.

Referencia esperada no codigo:

```ts
const adaptation = selectedAdaptation;
if (!adaptation) return null;
```

ou equivalente ja existente na tela. Nao refatore outras partes.

- [ ] **Step 4: Run the full detail client test file**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/candidaturas/[id]/detail-client.test.tsx --runInBand`

Expected: PASS em toda a suite do arquivo, incluindo o teste de multiplas analises.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/candidaturas/[id]/detail-client.test.tsx apps/web/src/app/candidaturas/[id]/detail-client.tsx
git commit -m "test: cover resume title per analysis"
```

### Task 5: Verificacao do escopo impactado

**Files:**
- Modify: nenhum arquivo obrigatorio

- [ ] **Step 1: Run web check**

Run: `npm run check --workspace @earlycv/web`

Expected: PASS

- [ ] **Step 2: Run targeted web build if available through workspace build**

Run: `npm run build --workspace @earlycv/web`

Expected: PASS

- [ ] **Step 3: Run the relevant web tests**

Run: `npm run test --workspace @earlycv/web -- apps/web/src/app/candidaturas/[id]/detail-client.test.tsx`

Expected: PASS

- [ ] **Step 4: Run repo-required verification before handoff**

Run: `npm run check && npm run generate --workspace @earlycv/database && npm run build && npm run test`

Expected: PASS em todos os comandos exigidos pelo repositorio, ou documentacao clara do primeiro bloqueio real encontrado.

- [ ] **Step 5: Commit**

```bash
git status
```

Se nao houver mudancas adicionais, nao criar commit novo nesta etapa.
