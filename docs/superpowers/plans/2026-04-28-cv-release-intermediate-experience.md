# CV Release Intermediate Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurar e padronizar a experiencia intermediaria de liberacao de CV com credito em `/adaptar/resultado` e `/dashboard`, com modal fade-in, estado de loading minimo de 3s, sucesso real com CTA de download e tratamento correto de erro sem sucesso falso.

**Architecture:** Reaproveitar a base visual do popup existente em `/adaptar/resultado` extraindo um componente compartilhado de modal de liberacao e um helper local de sincronizacao de tempo minimo. Cada rota mantém sua logica real de redeem/claim, mas passa a dirigir o mesmo estado de UI (`loading | success | error`) e o mesmo contrato de download. O backend continua autoridade unica para debito de credito; frontend so previne double-submit local.

**Tech Stack:** Next.js App Router (client components), TypeScript, React state/effects, fetch APIs existentes, CSS inline/Tailwind existente.

---

### Task 1: Mapear implementacao atual e pontos de reaproveitamento

**Files:**
- Modify: `apps/web/src/app/adaptar/resultado/page.tsx`
- Modify: `apps/web/src/app/dashboard/history-action-links.tsx`
- Create: `apps/web/src/components/cv-release-modal.tsx`

- [ ] **Step 1: Confirmar estado atual do popup e fluxos de redeem**

Validar no codigo:

```tsx
// /adaptar/resultado
const [showReleasePopup, setShowReleasePopup] = useState(false);
const [releasePopupVisible, setReleasePopupVisible] = useState(false);

// /dashboard
const [redeeming, setRedeeming] = useState(false);
// hoje: sucesso faz router.push(actions.resultHref)
```

- [ ] **Step 2: Documentar contrato minimo do componente compartilhado**

Definir contrato alvo:

```ts
type CvReleaseModalStatus = "loading" | "success" | "error";

type CvReleaseModalProps = {
  open: boolean;
  status: CvReleaseModalStatus;
  message?: string | null;
  canClose: boolean;
  visible: boolean;
  onClose: () => void;
  onDownloadPdf: () => void;
  onDownloadDocx: () => void;
  downloading: "pdf" | "docx" | null;
  canDownload: boolean;
};
```

- [ ] **Step 3: Commit de checkpoint de planejamento tecnico (opcional se sem mudanca de codigo)**

Run: `git status`
Expected: apenas mudancas de documentacao/plano (ou nada, se nao houver alteracao).

### Task 2: Criar componente compartilhado de modal de liberacao

**Files:**
- Create: `apps/web/src/components/cv-release-modal.tsx`
- Test: `apps/web/src/components/cv-release-modal.test.tsx` (se suite de componentes estiver habilitada)

- [ ] **Step 1: Escrever teste de render para estados loading/success/error (se houver infra de teste de componente)**

```tsx
it("renders loading copy and hides close button while loading", () => {
  render(
    <CvReleaseModal
      open
      visible
      status="loading"
      canClose={false}
      onClose={() => {}}
      onDownloadPdf={() => {}}
      onDownloadDocx={() => {}}
      downloading={null}
      canDownload={false}
    />,
  );

  expect(screen.getByText("Liberando seu CV...")).toBeInTheDocument();
  expect(screen.queryByLabelText("Fechar aviso")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Implementar componente com fade-in e tres estados**

```tsx
export function CvReleaseModal(props: CvReleaseModalProps) {
  if (!props.open) return null;

  const isLoading = props.status === "loading";
  const isSuccess = props.status === "success";

  return createPortal(
    <div style={{ opacity: props.visible ? 1 : 0, transition: "opacity 260ms ease-out" }}>
      {/* backdrop */}
      {/* card */}
      {isLoading ? <p>Liberando seu CV...</p> : null}
      {isSuccess ? (
        <p>
          Seu CV já está pronto para ser baixado. Não perca tempo: baixe o CV e candidate-se o mais rápido possível.
        </p>
      ) : null}
      {/* error state with message */}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 3: Garantir responsividade mobile no proprio componente**

Aplicar regras:

```tsx
style={{ width: "100%", maxWidth: 520, padding: "24px" }}
// em mobile: botoes em coluna unica
```

- [ ] **Step 4: Rodar teste do componente (ou pular com justificativa se nao existir harness)**

Run: `npm run test -- cv-release-modal`
Expected: PASS (ou comando inexistente -> registrar e validar via teste de pagina nas tasks seguintes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/cv-release-modal.tsx apps/web/src/components/cv-release-modal.test.tsx
git commit -m "feat(web): extract shared CV release modal states"
```

### Task 3: Integrar modal ao fluxo `/adaptar/resultado`

**Files:**
- Modify: `apps/web/src/app/adaptar/resultado/page.tsx`

- [ ] **Step 1: Escrever teste de comportamento para tempo minimo de 3s (unit do helper ou integration da pagina)**

```ts
it("keeps loading state until at least 3s even when redeem resolves early", async () => {
  vi.useFakeTimers();
  // click liberar, resolve fetch em 100ms
  // assert loading visible at t=500ms
  // advance to t=3000ms
  // assert success visible
});
```

- [ ] **Step 2: Introduzir estado local de release UI e helper de tempo minimo**

```ts
const [releaseModalOpen, setReleaseModalOpen] = useState(false);
const [releaseModalVisible, setReleaseModalVisible] = useState(false);
const [releaseStatus, setReleaseStatus] = useState<CvReleaseModalStatus>("loading");
const [releaseError, setReleaseError] = useState<string | null>(null);

const waitForMinimumDuration = async (startedAt: number, minMs: number) => {
  const elapsed = Date.now() - startedAt;
  if (elapsed < minMs) await new Promise((r) => setTimeout(r, minMs - elapsed));
};
```

- [ ] **Step 3: Atualizar `handleUseCredit` para abrir modal imediatamente e sincronizar sucesso com 3s**

```ts
const startedAt = Date.now();
setReleaseModalOpen(true);
requestAnimationFrame(() => setReleaseModalVisible(true));
setReleaseStatus("loading");

const res = await fetch("/api/cv-adaptation/claim-guest", ...);
// sucesso real
await waitForMinimumDuration(startedAt, 3000);
setReleaseStatus("success");
setClaiming(false);
```

- [ ] **Step 4: Atualizar caminho de erro para nao exibir sucesso falso**

```ts
catch (err) {
  setReleaseStatus("error");
  setReleaseError(resolvedMessage);
  setClaiming(false);
  setLocked(false);
}
```

- [ ] **Step 5: Substituir popup inline antigo por `CvReleaseModal`**

```tsx
<CvReleaseModal
  open={releaseModalOpen}
  visible={releaseModalVisible}
  status={releaseStatus}
  message={releaseError}
  canClose={releaseStatus !== "loading"}
  canDownload={Boolean(reviewAdaptationId) && releaseStatus === "success"}
  downloading={downloading}
  onDownloadPdf={() => handleDownload("pdf")}
  onDownloadDocx={() => handleDownload("docx")}
  onClose={handleCloseReleaseModal}
/>
```

- [ ] **Step 6: Rodar testes focados da pagina**

Run: `npm run test -- adaptar/resultado`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/adaptar/resultado/page.tsx
git commit -m "feat(web): add staged CV release modal in resultado flow"
```

### Task 4: Integrar modal ao fluxo `/dashboard` sem redirecionar

**Files:**
- Modify: `apps/web/src/app/dashboard/history-action-links.tsx`

- [ ] **Step 1: Escrever teste para garantir que sucesso nao redireciona e abre estado final no dashboard**

```ts
it("keeps user on dashboard and shows success release modal after redeem", async () => {
  // mock fetch ok
  // click "Liberar CV · 1 Crédito"
  // assert modal loading then success
  // assert router.push NOT called
});
```

- [ ] **Step 2: Adicionar estados do modal e timing minimo no dashboard**

```ts
const [releaseModalOpen, setReleaseModalOpen] = useState(false);
const [releaseModalVisible, setReleaseModalVisible] = useState(false);
const [releaseStatus, setReleaseStatus] = useState<CvReleaseModalStatus>("loading");
const [releaseError, setReleaseError] = useState<string | null>(null);
```

- [ ] **Step 3: Atualizar handler de redeem para abrir modal imediato, remover push no sucesso e habilitar downloads**

```ts
const startedAt = Date.now();
setRedeeming(true);
setReleaseModalOpen(true);
requestAnimationFrame(() => setReleaseModalVisible(true));
setReleaseStatus("loading");

const response = await fetch(actions.redeemHref, { method: "POST", cache: "no-store" });
if (!response.ok) throw new Error("Falha ao liberar CV");
await waitForMinimumDuration(startedAt, 3000);
setReleaseStatus("success");
setRedeeming(false);
```

- [ ] **Step 4: Ligar CTA de download do modal aos endpoints existentes (`actions.pdfHref` / `actions.docxHref`)**

```ts
await downloadFromApi({
  url: actions.pdfHref,
  fallbackFilename: "cv-adaptado.pdf",
  onStageChange: setDownloadStage,
});
```

- [ ] **Step 5: Tratar erro amigavel no modal e reabilitar tentativa**

```ts
catch (error) {
  setReleaseStatus("error");
  setReleaseError("Nao foi possivel liberar o CV agora. Tente novamente.");
  setRedeeming(false);
}
```

- [ ] **Step 6: Rodar testes focados do dashboard**

Run: `npm run test -- dashboard/history-action-links`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/history-action-links.tsx
git commit -m "feat(web): unify dashboard credit release with staged modal"
```

### Task 5: Verificacao final (lint, testes, regressao visual mobile/desktop)

**Files:**
- Verify only: rotas `/adaptar/resultado` e `/dashboard`

- [ ] **Step 1: Rodar lint do web app**

Run: `npm run lint --workspace @earlycv/web`
Expected: PASS sem novos erros.

- [ ] **Step 2: Rodar testes relevantes do web app**

Run: `npm run test --workspace @earlycv/web`
Expected: PASS nas suites impactadas.

- [ ] **Step 3: Rodar build do web app**

Run: `npm run build --workspace @earlycv/web`
Expected: build concluido sem erro.

- [ ] **Step 4: QA manual guiado**

Checklist:

```md
- /adaptar/resultado: click em "Liberar CV com 1 credito" abre modal com fade-in imediato
- estado loading aparece por >=3s quando API responde rapido
- sucesso aparece so apos sucesso real + janela minima
- mensagem final exata aparece
- botoes PDF/DOCX habilitam no sucesso
- erro real nao mostra sucesso e permite nova tentativa
- /dashboard: mesmo comportamento sem redirect
- mobile: modal nao quebra layout; ctas legiveis e clicaveis
```

- [ ] **Step 5: Commit final**

```bash
git add apps/web/src/components/cv-release-modal.tsx apps/web/src/app/adaptar/resultado/page.tsx apps/web/src/app/dashboard/history-action-links.tsx
git commit -m "feat(web): restore staged CV credit release experience across resultado and dashboard"
```
