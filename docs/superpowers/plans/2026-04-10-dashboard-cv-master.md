# Dashboard Principal + CV Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refinar o dashboard principal para ter uma ação central clara e adicionar o fluxo reutilizável de CV Master no dashboard e em `/adaptar` sem quebrar APIs existentes.

**Architecture:** A implementação fica toda no app web: (1) um utilitário server-side para ler resumes e identificar o master, (2) ajustes de hierarquia e copy em `/dashboard`, e (3) bifurcação controlada no fluxo de `/adaptar` entre usar CV Master e enviar novo arquivo. Mantemos os endpoints atuais (`GET /resumes`, `POST /cv-adaptation`, `POST /cv-adaptation/analyze-guest`) e só adicionamos consumo.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS v4, Biome, server actions/utilitários server-side.

---

## File Structure

- Create: `apps/web/src/lib/resumes-api.ts` - cliente server-side para listar resumes e helper para obter CV master.
- Modify: `apps/web/src/app/dashboard/page.tsx` - ajustes UX/UI + card CV Master + remoção de redundâncias.
- Modify: `apps/web/src/app/adaptar/page.tsx` - suporte ao modo `Usar meu CV base` e fallback `Enviar outro CV`.
- Create: `apps/web/src/lib/resumes-api.spec.ts` - teste unitário do helper de seleção do master.

### Task 1: CV Master Data Access

**Files:**
- Create: `apps/web/src/lib/resumes-api.ts`
- Test: `apps/web/src/lib/resumes-api.spec.ts`

- [ ] **Step 1: Write the failing test for master selection helper**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { getMasterResumeFromList, type ResumeDto } from "./resumes-api";

test("getMasterResumeFromList returns null when no master exists", () => {
  const input: ResumeDto[] = [
    {
      id: "r1",
      title: "CV Geral",
      sourceFileName: "cv.pdf",
      isMaster: false,
      updatedAt: "2026-04-10T12:00:00.000Z",
    },
  ];

  assert.equal(getMasterResumeFromList(input), null);
});

test("getMasterResumeFromList returns first resume marked as master", () => {
  const input: ResumeDto[] = [
    {
      id: "r1",
      title: "CV Geral",
      sourceFileName: "cv.pdf",
      isMaster: false,
      updatedAt: "2026-04-10T12:00:00.000Z",
    },
    {
      id: "r2",
      title: "CV Master",
      sourceFileName: "cv-master.pdf",
      isMaster: true,
      updatedAt: "2026-04-10T13:00:00.000Z",
    },
  ];

  assert.equal(getMasterResumeFromList(input)?.id, "r2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/src/lib/resumes-api.spec.ts`
Expected: FAIL with module/function not found (`resumes-api` absent).

- [ ] **Step 3: Implement minimal resumes API helper**

```ts
"use server";

import { apiRequest } from "./api-request";

export type ResumeDto = {
  id: string;
  title: string;
  sourceFileName: string | null;
  isMaster: boolean;
  updatedAt: string;
};

export async function listMyResumes(): Promise<ResumeDto[]> {
  const response = await apiRequest("GET", "/resumes");
  if (!response.ok) {
    throw new Error("Failed to list resumes");
  }
  return response.json() as Promise<ResumeDto[]>;
}

export function getMasterResumeFromList(
  resumes: ResumeDto[],
): ResumeDto | null {
  return resumes.find((resume) => resume.isMaster) ?? null;
}

export async function getMyMasterResume(): Promise<ResumeDto | null> {
  const resumes = await listMyResumes();
  return getMasterResumeFromList(resumes);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/src/lib/resumes-api.spec.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/resumes-api.ts apps/web/src/lib/resumes-api.spec.ts
git commit -m "feat(web): add master resume helper for dashboard and adaptar"
```

### Task 2: Dashboard UX/UI Refinement + CV Master Card

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Create: `apps/web/src/lib/dashboard-copy.ts`
- Create: `apps/web/src/lib/dashboard-copy.spec.ts`

- [ ] **Step 1: Write failing test for dashboard copy helpers**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatDashboardOverview,
  getDashboardMetricLabels,
} from "./dashboard-copy";

test("getDashboardMetricLabels returns the approved labels", () => {
  const labels = getDashboardMetricLabels();

  assert.deepEqual(labels, {
    averageScore: "Seu score médio",
    compatibility: "Vagas que combinam com você",
    recentImprovement: "Melhoria recente",
  });
});

test("formatDashboardOverview returns result-oriented summary lines", () => {
  const result = formatDashboardOverview({
    analyzedCount: 3,
    generatedCount: 2,
    creditsAvailableLabel: "6",
  });

  assert.deepEqual(result, {
    analyzed: "3 CVs analisados",
    generated: "2 versões geradas",
    credits: "6 créditos disponíveis",
  });
});
```

- [ ] **Step 2: Run test to verify fail/scope**

Run: `node --test apps/web/src/lib/dashboard-copy.spec.ts`
Expected: FAIL with module/function not found (`dashboard-copy` absent).

- [ ] **Step 3: Implement minimal dashboard copy helper**

```ts
export function getDashboardMetricLabels() {
  return {
    averageScore: "Seu score médio",
    compatibility: "Vagas que combinam com você",
    recentImprovement: "Melhoria recente",
  } as const;
}

export function formatDashboardOverview(input: {
  analyzedCount: number;
  generatedCount: number;
  creditsAvailableLabel: string;
}) {
  return {
    analyzed: `${input.analyzedCount} CVs analisados`,
    generated: `${input.generatedCount} versões geradas`,
    credits: `${input.creditsAvailableLabel} créditos disponíveis`,
  } as const;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/src/lib/dashboard-copy.spec.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Implement dashboard page updates**

Apply these code changes in `apps/web/src/app/dashboard/page.tsx`:

```tsx
import { getMyMasterResume } from "@/lib/resumes-api";

const [plan, adaptations, masterResume] = await Promise.allSettled([
  getMyPlan(),
  listCvAdaptations(1, 20),
  getMyMasterResume(),
]);

const masterResumeInfo =
  masterResume.status === "fulfilled" ? masterResume.value : null;
```

Then apply UX changes:

```tsx
import {
  formatDashboardOverview,
  getDashboardMetricLabels,
} from "@/lib/dashboard-copy";

const overview = formatDashboardOverview({
  analyzedCount,
  generatedCount,
  creditsAvailableLabel,
});
const metricLabels = getDashboardMetricLabels();

// Resumo topo
<p className="text-xl font-bold text-[#111827]">Visão geral</p>
<p className="text-sm text-[#6B7280]">{overview.analyzed}</p>
<p className="text-sm text-[#6B7280]">{overview.generated}</p>
<p className="text-sm text-[#6B7280]">{overview.credits}</p>

// CTA dominante
<a
  href="/adaptar"
  style={{ color: "#ffffff" }}
  className="mt-6 inline-flex h-12 items-center justify-center rounded-[12px] bg-[#111827] px-8 text-base font-semibold transition-colors hover:bg-[#1F2937]"
>
  Analisar nova vaga
</a>
<p className="mt-2 text-sm text-[#6B7280]">Leva menos de 2 minutos</p>

// CV Master card (entre CTA e métricas)
{masterResumeInfo ? (
  <section className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
    <p className="text-lg font-semibold text-[#111827]">Seu CV base está pronto</p>
    <p className="mt-1 text-sm text-[#6B7280]">Você pode usá-lo em novas análises</p>
    <p className="mt-3 text-sm text-[#111827]">
      {masterResumeInfo.sourceFileName ?? masterResumeInfo.title}
    </p>
    <p className="text-xs text-[#6B7280]">
      Atualizado em {formatDate(masterResumeInfo.updatedAt)}
    </p>
    <div className="mt-4 flex gap-3">
      <a href="/meus-cvs" className="inline-flex h-9 items-center rounded-[10px] border border-[#E5E7EB] px-4 text-sm font-semibold text-[#111827]">Atualizar CV</a>
      <a href="/meus-cvs" className="inline-flex h-9 items-center rounded-[10px] border border-[#E5E7EB] px-4 text-sm font-semibold text-[#111827]">Ver CV</a>
    </div>
  </section>
) : (
  <section className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
    <p className="text-lg font-semibold text-[#111827]">Cadastre seu CV base</p>
    <p className="mt-1 text-sm text-[#6B7280]">Evite subir seu currículo toda vez. Use um CV base para todas as análises.</p>
    <a href="/meus-cvs" className="mt-4 inline-flex h-9 items-center rounded-[10px] bg-[#111827] px-4 text-sm font-semibold text-white">Cadastrar CV</a>
  </section>
)}
```

Also remove duplicated action points by deleting these elements:
- the header action button `Analisar nova vaga` inside the history section.
- the final plan/action section after the history block.

And update metrics copy:

```tsx
{metricLabels.averageScore}
{metricLabels.compatibility}
{metricLabels.recentImprovement}
```

- [ ] **Step 6: Run focused checks**

Run:
- `node --test apps/web/src/lib/dashboard-test-metrics.spec.ts`
- `npx biome check --config-path "$(realpath biome.json)" apps/web/src/app/dashboard/page.tsx apps/web/src/lib/dashboard-copy.ts`

Expected: PASS for both commands.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/page.tsx apps/web/src/lib/dashboard-copy.ts apps/web/src/lib/dashboard-copy.spec.ts
git commit -m "feat(web): refine dashboard hierarchy and add cv master card"
```

### Task 3: Adaptar Flow With CV Master Option

**Files:**
- Modify: `apps/web/src/app/adaptar/page.tsx`
- Modify: `apps/web/src/lib/cv-adaptation-api.ts`
- Create: `apps/web/src/lib/adaptar-flow.ts`
- Create: `apps/web/src/lib/adaptar-flow.spec.ts`

- [ ] **Step 1: Write failing test for request builder/helper in adaptar flow**

Create the test in `apps/web/src/lib/adaptar-flow.spec.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAdaptarMode } from "./adaptar-flow";

test("buildAdaptarMode defaults to master when master exists", () => {
  assert.equal(buildAdaptarMode({ hasMasterResume: true }), "master");
});

test("buildAdaptarMode uses upload when no master", () => {
  assert.equal(buildAdaptarMode({ hasMasterResume: false }), "upload");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/src/lib/adaptar-flow.spec.ts`
Expected: FAIL with missing module/helper.

- [ ] **Step 3: Implement adaptar mode helper**

In `apps/web/src/lib/adaptar-flow.ts`:

```ts
export function buildAdaptarMode(input: { hasMasterResume: boolean }) {
  return input.hasMasterResume ? "master" : "upload";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/src/lib/adaptar-flow.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add minimal API function for master-based adaptation**

In `apps/web/src/lib/cv-adaptation-api.ts`:

```ts
export async function createCvAdaptationFromMaster(payload: {
  masterResumeId: string;
  jobDescriptionText: string;
}): Promise<CvAdaptationDto> {
  const response = await apiRequest("POST", "/cv-adaptation", payload);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create adaptation: ${error}`);
  }
  return response.json() as Promise<CvAdaptationDto>;
}
```

In `apps/web/src/app/adaptar/page.tsx`, add logic:

```tsx
const [masterResume, setMasterResume] = useState<ResumeDto | null>(null);
const [flowMode, setFlowMode] = useState<"master" | "upload">("upload");

useEffect(() => {
  getMyMasterResume()
    .then((resume) => {
      setMasterResume(resume);
      setFlowMode(buildAdaptarMode({ hasMasterResume: Boolean(resume) }));
    })
    .catch(() => {
      setMasterResume(null);
      setFlowMode("upload");
    });
}, []);

if (flowMode === "master") {
  if (!masterResume) {
    setError("CV base indisponível. Envie outro CV.");
    return;
  }

  const adaptation = await createCvAdaptationFromMaster({
    masterResumeId: masterResume.id,
    jobDescriptionText: jobDescription,
  });
  router.push(`/adaptar/${adaptation.id}/resultado`);
  return;
}

// fallback atual permanece no modo "upload"
```

Render mode switch only when master exists:

```tsx
{masterResume && (
  <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
    <p className="text-sm font-semibold text-[#111111]">Como você quer analisar?</p>
    <div className="mt-3 flex gap-2">
      <button type="button" onClick={() => setFlowMode("master")} className="rounded-[10px] border border-[#E5E7EB] px-4 py-2 text-sm font-semibold">Usar meu CV base</button>
      <button type="button" onClick={() => setFlowMode("upload")} className="rounded-[10px] border border-[#E5E7EB] px-4 py-2 text-sm font-semibold">Enviar outro CV</button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Run focused checks**

Run:
- `npx biome check --config-path "$(realpath biome.json)" apps/web/src/app/adaptar/page.tsx`
- `npx biome check --config-path "$(realpath biome.json)" apps/web/src/lib/cv-adaptation-api.ts`

Expected: PASS for modified files.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/adaptar/page.tsx apps/web/src/lib/cv-adaptation-api.ts apps/web/src/lib/adaptar-flow.ts apps/web/src/lib/adaptar-flow.spec.ts
git commit -m "feat(web): support cv master option in adaptar flow"
```

### Task 4: Final Verification

**Files:**
- Verify: `apps/web/src/app/dashboard/page.tsx`
- Verify: `apps/web/src/app/adaptar/page.tsx`
- Verify: `apps/web/src/lib/resumes-api.ts`
- Verify: `apps/web/src/lib/cv-adaptation-api.ts`
- Verify: `apps/web/src/lib/dashboard-copy.ts`
- Verify: `apps/web/src/lib/adaptar-flow.ts`

- [ ] **Step 1: Run targeted functional checks manually**

Manual checklist:
- Authenticated user with master: dashboard shows "Seu CV base está pronto" and two actions to `/meus-cvs`.
- Authenticated user without master: dashboard shows "Cadastre seu CV base" with one action.
- `/dashboard` has single dominant CTA `Analisar nova vaga` and no duplicate in history.
- `/adaptar` with master shows choice (`Usar meu CV base` / `Enviar outro CV`).
- Choosing master goes to `/adaptar/[id]/resultado`.
- Choosing upload preserves previous guest-analysis flow.

- [ ] **Step 2: Run final focused checks**

Run:
- `npx biome check --config-path "$(realpath biome.json)" apps/web/src/app/dashboard/page.tsx apps/web/src/app/adaptar/page.tsx apps/web/src/lib/resumes-api.ts apps/web/src/lib/cv-adaptation-api.ts apps/web/src/lib/dashboard-copy.ts apps/web/src/lib/adaptar-flow.ts`
- `node --test apps/web/src/lib/resumes-api.spec.ts apps/web/src/lib/dashboard-copy.spec.ts apps/web/src/lib/adaptar-flow.spec.ts`

Expected: PASS for changed files.

- [ ] **Step 3: Run git diff sanity review**

Run: `git diff -- apps/web/src/app/dashboard/page.tsx apps/web/src/app/adaptar/page.tsx apps/web/src/lib/resumes-api.ts apps/web/src/lib/cv-adaptation-api.ts apps/web/src/lib/dashboard-copy.ts apps/web/src/lib/adaptar-flow.ts`
Expected: only intended UX/UI + CV Master flow changes.

- [ ] **Step 4: Commit verification pass**

```bash
git add apps/web/src/app/dashboard/page.tsx apps/web/src/app/adaptar/page.tsx apps/web/src/lib/resumes-api.ts apps/web/src/lib/cv-adaptation-api.ts apps/web/src/lib/dashboard-copy.ts apps/web/src/lib/adaptar-flow.ts
git commit -m "chore(web): finalize dashboard + cv master verification pass"
```
