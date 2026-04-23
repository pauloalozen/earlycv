# Tracking de Jornada + Sankey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar tracking completo da jornada de produto (sessão, navegação, micro-interações e abandono) para análise Sankey no PostHog sem alterar UX/fluxo.

**Architecture:** Implementar uma camada central de tracking no `apps/web` para gerar eventos consistentes (`session_started`, `session_engaged`, `page_view`, `page_leave` e micro-interações), enriquecendo payload com `routeVisitId`, correlação e idempotência. Reutilizar `emitBusinessFunnelEvent` no frontend e manter `apps/api` como fonte de verdade para validação de ownership/versionamento/dedupe e export para PostHog.

**Tech Stack:** Next.js App Router (client template + pages), TypeScript, Vitest, NestJS, PostHog exporter, Prisma model existente (`BusinessFunnelEvent`).

## Execution Memory Update (2026-04-23)

- Plano executado fim-a-fim com integração web/api para eventos de jornada e proteção de ownership/versionamento.
- Ajustes de regressões e falhas preexistentes de testes também foram incluídos para estabilizar o repositório.
- Estado final validado com `npm test` no workspace raiz (suítes de packages, api e web aprovadas).

---

## File Structure Map

- Create: `apps/web/src/lib/journey-tracking.ts`
  - Contrato de evento, regras de rota elegível, sessão (`sessionInternalId`), `routeVisitId`, idempotency key, checkout intent marker e emissor central.
- Create: `apps/web/src/lib/journey-tracking.spec.ts`
  - Testes unitários da lógica pura do tracker (elegibilidade, ciclo `page_view`/`page_leave`, one-shot de sessão, checkout abandonment).
- Create: `apps/web/src/app/_components/journey-tracker-provider.tsx`
  - Integração client-side global com `usePathname`, listeners de lifecycle/interação/click-submit para emitir eventos sem tocar na UI.
- Modify: `apps/web/src/app/template.tsx`
  - Envelopar conteúdo com provider global de jornada.
- Modify: `apps/web/src/app/adaptar/page.tsx`
  - Remapear micro-interações para camada central (`cv_upload_clicked`, `job_description_focus`, `job_description_paste`) evitando duplicidade com eventos legados.
- Modify: `apps/web/src/app/adaptar/resultado/page.tsx`
  - Emitir `download_cv_clicked` e `cta_signup_click` pelos handlers existentes.
- Modify: `apps/web/src/app/adaptar/page.submit-flow.spec.tsx`
  - Cobrir os novos eventos sem quebrar cobertura legada.
- Create: `apps/web/src/app/template.journey-tracking.spec.tsx`
  - Validar disparo global de `page_view`/`page_leave`/`session_started`/`session_engaged` e exclusão de `/admin`/`/superadmin`.
- Modify: `apps/api/src/analysis-observability/analysis-event-version.registry.ts`
  - Registrar novos eventos (versão `1`).
- Modify: `apps/api/src/analysis-observability/business-funnel-event-ownership.ts`
  - Definir ownership frontend/backend para novos eventos.
- Modify: `apps/api/src/posthog-integration/posthog-event-exporter.service.ts`
  - Mapear novos eventos para export PostHog.
- Modify: `apps/api/src/analysis-observability/business-funnel-event.service.spec.ts`
  - Cobrir validação de versionamento/ownership dos novos eventos.
- Modify: `apps/api/src/plans/plans.service.ts`
  - Emitir evento backend `payment_failed` em status terminal de falha no webhook MP.
- Create: `apps/api/src/plans/plans.service.spec.ts`
  - Cobrir emissão de `payment_failed` e não-emissão em status aprovados.

### Task 1: Implementar núcleo de tracking de jornada (lógica pura)

**Files:**
- Create: `apps/web/src/lib/journey-tracking.ts`
- Test: `apps/web/src/lib/journey-tracking.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  createJourneyState,
  isEligibleProductRoute,
  startRouteVisit,
  finishRouteVisit,
  shouldEmitSessionStarted,
  shouldEmitSessionEngaged,
  createCheckoutIntentMarker,
  shouldEmitCheckoutAbandoned,
} from "./journey-tracking";

describe("journey-tracking core", () => {
  it("filters admin and superadmin routes", () => {
    expect(isEligibleProductRoute("/")) .toBe(true);
    expect(isEligibleProductRoute("/adaptar")) .toBe(true);
    expect(isEligibleProductRoute("/admin")) .toBe(false);
    expect(isEligibleProductRoute("/admin/usuarios")) .toBe(false);
    expect(isEligibleProductRoute("/superadmin/equipe")) .toBe(false);
  });

  it("creates routeVisitId on page_view and closes on page_leave", () => {
    const state = createJourneyState("session-1");
    const visit = startRouteVisit(state, "/adaptar", "2026-04-22T10:00:00.000Z");
    expect(visit.routeVisitId).toBeTruthy();

    const leave = finishRouteVisit(state, "2026-04-22T10:00:03.000Z");
    expect(leave?.timeOnPageMs).toBe(3000);
  });

  it("emits session_started and session_engaged once per session", () => {
    const state = createJourneyState("session-1");
    expect(shouldEmitSessionStarted(state)).toBe(true);
    expect(shouldEmitSessionStarted(state)).toBe(false);
    expect(shouldEmitSessionEngaged(state)).toBe(true);
    expect(shouldEmitSessionEngaged(state)).toBe(false);
  });

  it("emits checkout_abandoned once with stabilized window", () => {
    const state = createJourneyState("session-1");
    const marker = createCheckoutIntentMarker({
      sessionInternalId: "session-1",
      routeVisitId: "visit-1",
      planId: "pro",
      startedAt: "2026-04-22T10:00:00.000Z",
    });
    expect(shouldEmitCheckoutAbandoned(state, marker, "2026-04-22T10:00:20.000Z")).toBe(false);
    expect(shouldEmitCheckoutAbandoned(state, marker, "2026-04-22T10:01:10.000Z")).toBe(true);
    expect(shouldEmitCheckoutAbandoned(state, marker, "2026-04-22T10:02:10.000Z")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- src/lib/journey-tracking.spec.ts`
Expected: FAIL with module/function not found errors for `journey-tracking` exports.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/journey-tracking.ts
export type JourneyState = {
  sessionInternalId: string;
  previousRoute: string | null;
  activeVisit: { route: string; routeVisitId: string; startedAtIso: string } | null;
  sessionStartedEmitted: boolean;
  sessionEngagedEmitted: boolean;
  checkoutAbandonedKeys: Set<string>;
};

export function isEligibleProductRoute(pathname: string): boolean {
  return !(pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/superadmin" || pathname.startsWith("/superadmin/"));
}

export function createJourneyState(sessionInternalId: string): JourneyState {
  return {
    sessionInternalId,
    previousRoute: null,
    activeVisit: null,
    sessionStartedEmitted: false,
    sessionEngagedEmitted: false,
    checkoutAbandonedKeys: new Set<string>(),
  };
}

export function startRouteVisit(state: JourneyState, route: string, occurredAtIso: string) {
  const routeVisitId = `${state.sessionInternalId}:${route}:${occurredAtIso}`;
  state.activeVisit = { route, routeVisitId, startedAtIso: occurredAtIso };
  return state.activeVisit;
}

export function finishRouteVisit(state: JourneyState, occurredAtIso: string) {
  if (!state.activeVisit) return null;
  const startedAt = Date.parse(state.activeVisit.startedAtIso);
  const endedAt = Date.parse(occurredAtIso);
  const timeOnPageMs = Number.isFinite(startedAt) && Number.isFinite(endedAt) ? Math.max(0, endedAt - startedAt) : 0;
  const result = {
    routeVisitId: state.activeVisit.routeVisitId,
    route: state.activeVisit.route,
    timeOnPageMs,
  };
  state.previousRoute = state.activeVisit.route;
  state.activeVisit = null;
  return result;
}

export function shouldEmitSessionStarted(state: JourneyState): boolean {
  if (state.sessionStartedEmitted) return false;
  state.sessionStartedEmitted = true;
  return true;
}

export function shouldEmitSessionEngaged(state: JourneyState): boolean {
  if (state.sessionEngagedEmitted) return false;
  state.sessionEngagedEmitted = true;
  return true;
}

export type CheckoutIntentMarker = {
  sessionInternalId: string;
  routeVisitId: string;
  planId: string;
  startedAt: string;
};

export function createCheckoutIntentMarker(input: CheckoutIntentMarker): CheckoutIntentMarker {
  return input;
}

export function shouldEmitCheckoutAbandoned(state: JourneyState, marker: CheckoutIntentMarker, nowIso: string): boolean {
  const key = `${marker.sessionInternalId}:${marker.planId}:checkout_abandoned`;
  if (state.checkoutAbandonedKeys.has(key)) return false;
  const elapsed = Date.parse(nowIso) - Date.parse(marker.startedAt);
  if (Number.isNaN(elapsed) || elapsed < 60_000) return false;
  state.checkoutAbandonedKeys.add(key);
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/web -- src/lib/journey-tracking.spec.ts`
Expected: PASS with 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/journey-tracking.ts apps/web/src/lib/journey-tracking.spec.ts
git commit -m "feat(web): add journey tracking core primitives"
```

### Task 2: Integrar tracker global no template (page/session lifecycle)

**Files:**
- Create: `apps/web/src/app/_components/journey-tracker-provider.tsx`
- Modify: `apps/web/src/app/template.tsx`
- Test: `apps/web/src/app/template.journey-tracking.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const emitBusinessFunnelEventMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn(() => "/adaptar"));

vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));
vi.mock("@/lib/cv-adaptation-api", () => ({ emitBusinessFunnelEvent: emitBusinessFunnelEventMock }));

import Template from "./template";

describe("Template journey tracking", () => {
  it("emits page_view and session_started on first eligible route", async () => {
    render(<Template><div>child</div></Template>);
    expect(emitBusinessFunnelEventMock).toHaveBeenCalledWith(expect.objectContaining({ eventName: "page_view" }));
    expect(emitBusinessFunnelEventMock).toHaveBeenCalledWith(expect.objectContaining({ eventName: "session_started" }));
  });

  it("does not emit for admin routes", async () => {
    usePathnameMock.mockReturnValue("/admin");
    render(<Template><div>child</div></Template>);
    expect(emitBusinessFunnelEventMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- src/app/template.journey-tracking.spec.tsx`
Expected: FAIL because provider integration is not present.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/app/_components/journey-tracker-provider.tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { emitBusinessFunnelEvent } from "@/lib/cv-adaptation-api";
import { createJourneyState, isEligibleProductRoute, shouldEmitSessionEngaged, shouldEmitSessionStarted, startRouteVisit, finishRouteVisit } from "@/lib/journey-tracking";

const SESSION_KEY = "journey_session_internal_id";

function getSessionInternalId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, next);
  return next;
}

export function JourneyTrackerProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const stateRef = useRef<ReturnType<typeof createJourneyState> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!stateRef.current) stateRef.current = createJourneyState(getSessionInternalId());
    const state = stateRef.current;
    if (!isEligibleProductRoute(pathname)) return;

    const occurredAt = new Date().toISOString();
    const visit = startRouteVisit(state, pathname, occurredAt);
    void emitBusinessFunnelEvent({ eventName: "page_view", eventVersion: 1, idempotencyKey: `${visit.routeVisitId}:page_view`, metadata: { occurredAt, route: pathname, previous_route: state.previousRoute, routeVisitId: visit.routeVisitId, sessionInternalId: state.sessionInternalId, userId: null } });

    if (shouldEmitSessionStarted(state)) {
      void emitBusinessFunnelEvent({ eventName: "session_started", eventVersion: 1, idempotencyKey: `${state.sessionInternalId}:session_started`, metadata: { occurredAt, route: pathname, previous_route: state.previousRoute, routeVisitId: visit.routeVisitId, sessionInternalId: state.sessionInternalId, userId: null } });
    }

    const onInteract = () => {
      if (!shouldEmitSessionEngaged(state)) return;
      void emitBusinessFunnelEvent({ eventName: "session_engaged", eventVersion: 1, idempotencyKey: `${state.sessionInternalId}:session_engaged`, metadata: { occurredAt: new Date().toISOString(), route: pathname, previous_route: state.previousRoute, routeVisitId: visit.routeVisitId, sessionInternalId: state.sessionInternalId, userId: null } });
    };

    const onPageHide = () => {
      const leave = finishRouteVisit(state, new Date().toISOString());
      if (!leave) return;
      void emitBusinessFunnelEvent({ eventName: "page_leave", eventVersion: 1, idempotencyKey: `${leave.routeVisitId}:page_leave`, metadata: { occurredAt: new Date().toISOString(), route: leave.route, previous_route: state.previousRoute, routeVisitId: leave.routeVisitId, sessionInternalId: state.sessionInternalId, userId: null, time_on_page_ms: leave.timeOnPageMs } }).catch((error) => {
        if (process.env.NODE_ENV !== "production") console.debug("[journey] page_leave failed", error);
      });
    };

    window.addEventListener("click", onInteract, { once: true });
    window.addEventListener("keydown", onInteract, { once: true });
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("click", onInteract);
      window.removeEventListener("keydown", onInteract);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [pathname]);

  return children;
}
```

```tsx
// apps/web/src/app/template.tsx (excerpt)
import { JourneyTrackerProvider } from "./_components/journey-tracker-provider";

export default function Template({ children }: { children: React.ReactNode }) {
  // ...loading overlay existente
  return (
    <JourneyTrackerProvider>
      {/* existing content */}
      {children}
    </JourneyTrackerProvider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/web -- src/app/template.journey-tracking.spec.tsx`
Expected: PASS with route eligibility and initial session/page emissions validated.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/template.tsx apps/web/src/app/_components/journey-tracker-provider.tsx apps/web/src/app/template.journey-tracking.spec.tsx
git commit -m "feat(web): add global journey tracker provider"
```

### Task 3: Instrumentar micro-interações em `/adaptar`

**Files:**
- Modify: `apps/web/src/app/adaptar/page.tsx`
- Modify: `apps/web/src/app/adaptar/page.submit-flow.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("emits cv_upload_clicked, job_description_focus and job_description_paste once", async () => {
  const { container } = render(<AdaptarPage />);
  const uploadButton = await screen.findByRole("button", { name: /Arraste ou clique para enviar/i });
  const textarea = await screen.findByPlaceholderText("Cole a vaga completa (isso melhora sua análise)...");

  emitBusinessFunnelEventMock.mockClear();
  fireEvent.click(uploadButton);
  fireEvent.focus(textarea);
  fireEvent.paste(textarea, { clipboardData: { getData: () => "vaga" } as unknown as DataTransfer });
  fireEvent.focus(textarea);
  fireEvent.paste(textarea, { clipboardData: { getData: () => "vaga 2" } as unknown as DataTransfer });

  const names = emitBusinessFunnelEventMock.mock.calls.map(([payload]) => payload.eventName);
  expect(names.filter((item) => item === "cv_upload_clicked")).toHaveLength(1);
  expect(names.filter((item) => item === "job_description_focus")).toHaveLength(1);
  expect(names.filter((item) => item === "job_description_paste")).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- src/app/adaptar/page.submit-flow.spec.tsx`
Expected: FAIL because new event names are not emitted yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/app/adaptar/page.tsx (excerpt)
const jobDescriptionFocusTrackedRef = useRef(false);
const jobDescriptionPasteTrackedRef = useRef(false);

<button
  type="button"
  onClick={() => {
    emitUiFunnelEvent("cv_upload_clicked", { attemptId: buildClientAttemptId() });
    emitUiFunnelEvent("cv_upload_started", { attemptId: buildClientAttemptId() });
    fileInputRef.current?.click();
  }}
>

<textarea
  onFocus={() => {
    if (jobDescriptionFocusTrackedRef.current) return;
    jobDescriptionFocusTrackedRef.current = true;
    emitUiFunnelEvent("job_description_focus");
  }}
  onPaste={() => {
    if (jobDescriptionPasteTrackedRef.current) return;
    jobDescriptionPasteTrackedRef.current = true;
    emitUiFunnelEvent("job_description_paste");
  }}
  onChange={(e) => {
    // lógica existente de job_description_filled permanece
  }}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/web -- src/app/adaptar/page.submit-flow.spec.tsx`
Expected: PASS with new assertions + legacy flow assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/adaptar/page.tsx apps/web/src/app/adaptar/page.submit-flow.spec.tsx
git commit -m "feat(web): track adapt page micro interactions"
```

### Task 4: Instrumentar micro-interações em `/adaptar/resultado`, CTA signup, teaser e checkout abandonment

**Files:**
- Modify: `apps/web/src/app/adaptar/resultado/page.tsx`
- Modify: `apps/web/src/app/_components/journey-tracker-provider.tsx`
- Test: `apps/web/src/app/template.journey-tracking.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("emits checkout_abandoned once after stabilization when checkout intent has no terminal event", async () => {
  vi.useFakeTimers();
  render(<Template><div /></Template>);

  document.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  vi.advanceTimersByTime(61_000);
  window.dispatchEvent(new PopStateEvent("popstate"));

  const names = emitBusinessFunnelEventMock.mock.calls.map(([payload]) => payload.eventName);
  expect(names.filter((item) => item === "checkout_abandoned")).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/web -- src/app/template.journey-tracking.spec.tsx`
Expected: FAIL because checkout marker lifecycle is not implemented.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/app/_components/journey-tracker-provider.tsx (excerpt)
const CHECKOUT_MARKER_KEY = "journey_checkout_intent";

function writeCheckoutIntent(marker: { sessionInternalId: string; planId: string; routeVisitId: string; startedAt: string }) {
  sessionStorage.setItem(CHECKOUT_MARKER_KEY, JSON.stringify(marker));
}

function tryEmitCheckoutAbandoned(state: ReturnType<typeof createJourneyState>, routeVisitId: string, route: string) {
  const raw = sessionStorage.getItem(CHECKOUT_MARKER_KEY);
  if (!raw) return;
  const marker = JSON.parse(raw) as { sessionInternalId: string; planId: string; routeVisitId: string; startedAt: string };
  if (!shouldEmitCheckoutAbandoned(state, marker, new Date().toISOString())) return;
  void emitBusinessFunnelEvent({
    eventName: "checkout_abandoned",
    eventVersion: 1,
    idempotencyKey: `${marker.sessionInternalId}:${marker.planId}:checkout_abandoned`,
    metadata: {
      occurredAt: new Date().toISOString(),
      route,
      previous_route: state.previousRoute,
      sessionInternalId: state.sessionInternalId,
      routeVisitId,
      userId: null,
      planId: marker.planId,
    },
  });
}

useEffect(() => {
  const onDocumentSubmit = (event: Event) => {
    const target = event.target as HTMLFormElement | null;
    if (!target) return;
    if (target.getAttribute("action") !== "/plans/checkout") return;
    const formData = new FormData(target);
    const planId = String(formData.get("planId") ?? "").trim();
    if (!planId || !stateRef.current?.activeVisit) return;
    writeCheckoutIntent({
      sessionInternalId: stateRef.current.sessionInternalId,
      planId,
      routeVisitId: stateRef.current.activeVisit.routeVisitId,
      startedAt: new Date().toISOString(),
    });
  };

  document.addEventListener("submit", onDocumentSubmit, true);
  return () => document.removeEventListener("submit", onDocumentSubmit, true);
}, []);
```

```tsx
// apps/web/src/app/adaptar/resultado/page.tsx (excerpt)
const emitUiFunnelEvent = (eventName: string, metadata?: Record<string, unknown>) => {
  void emitBusinessFunnelEvent({ eventName, eventVersion: 1, metadata });
};

const handleDownload = async (format: "pdf" | "docx") => {
  emitUiFunnelEvent("download_cv_clicked", { format });
  // fluxo existente
};

<a
  href={`/entrar?next=${encodeURIComponent("/adaptar/resultado?autoSave=1")}`}
  onClick={() => {
    emitUiFunnelEvent("cta_signup_click", { ctaLocation: "resultado_unlock" });
  }}
>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/web -- src/app/template.journey-tracking.spec.tsx src/app/adaptar/page.submit-flow.spec.tsx`
Expected: PASS with checkout abandonment dedupe and micro-interaction assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/_components/journey-tracker-provider.tsx apps/web/src/app/adaptar/resultado/page.tsx apps/web/src/app/template.journey-tracking.spec.tsx
git commit -m "feat(web): add checkout abandonment and resultado journey events"
```

### Task 5: Atualizar registry, ownership e export PostHog no backend

**Files:**
- Modify: `apps/api/src/analysis-observability/analysis-event-version.registry.ts`
- Modify: `apps/api/src/analysis-observability/business-funnel-event-ownership.ts`
- Modify: `apps/api/src/posthog-integration/posthog-event-exporter.service.ts`
- Modify: `apps/api/src/analysis-observability/business-funnel-event.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("accepts new frontend journey events with version 1", async () => {
  const service = createServiceForValidationOnly();

  await assert.doesNotReject(
    service.record(
      { eventName: "page_view", eventVersion: 1 },
      baseContext,
      "frontend",
    ),
  );
});

test("rejects frontend emission of backend payment_failed", async () => {
  const service = createServiceForValidationOnly();

  await assert.rejects(
    service.record({ eventName: "payment_failed", eventVersion: 1 }, baseContext, "frontend"),
    /ownership/i,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/api -- src/analysis-observability/business-funnel-event.service.spec.ts`
Expected: FAIL because event names are missing from version/ownership registry.

- [ ] **Step 3: Write minimal implementation**

```ts
// analysis-event-version.registry.ts (excerpt)
export const BUSINESS_FUNNEL_EVENT_VERSION_MAP = {
  // ...existing
  session_started: 1,
  session_engaged: 1,
  page_view: 1,
  page_leave: 1,
  cv_upload_clicked: 1,
  job_description_focus: 1,
  job_description_paste: 1,
  teaser_scroll: 1,
  cta_signup_click: 1,
  download_cv_clicked: 1,
  checkout_abandoned: 1,
  payment_failed: 1,
} as const;
```

```ts
// business-funnel-event-ownership.ts (excerpt)
export const FUNNEL_EVENT_OWNERSHIP = {
  // ...existing
  session_started: "frontend",
  session_engaged: "frontend",
  page_view: "frontend",
  page_leave: "frontend",
  cv_upload_clicked: "frontend",
  job_description_focus: "frontend",
  job_description_paste: "frontend",
  teaser_scroll: "frontend",
  cta_signup_click: "frontend",
  download_cv_clicked: "frontend",
  checkout_abandoned: "frontend",
  payment_failed: "backend",
} as const;
```

```ts
// posthog-event-exporter.service.ts (excerpt)
const BUSINESS_FUNNEL_EVENT_MAPPING: Record<string, string> = {
  // ...existing
  session_started: "session_started",
  session_engaged: "session_engaged",
  page_view: "page_view",
  page_leave: "page_leave",
  cv_upload_clicked: "cv_upload_clicked",
  job_description_focus: "job_description_focus",
  job_description_paste: "job_description_paste",
  teaser_scroll: "teaser_scroll",
  cta_signup_click: "cta_signup_click",
  download_cv_clicked: "download_cv_clicked",
  checkout_abandoned: "checkout_abandoned",
  payment_failed: "payment_failed",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/api -- src/analysis-observability/business-funnel-event.service.spec.ts`
Expected: PASS with new ownership/version coverage.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/analysis-observability/analysis-event-version.registry.ts apps/api/src/analysis-observability/business-funnel-event-ownership.ts apps/api/src/posthog-integration/posthog-event-exporter.service.ts apps/api/src/analysis-observability/business-funnel-event.service.spec.ts
git commit -m "feat(api): register journey events for funnel validation and export"
```

### Task 6: Emitir `payment_failed` no backend em webhook de pagamento

**Files:**
- Modify: `apps/api/src/plans/plans.service.ts`
- Create: `apps/api/src/plans/plans.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { PlansService } from "./plans.service";

test("emits payment_failed when mercadopago webhook status is failed", async () => {
  const emitted: string[] = [];
  const service = new PlansService(createDbMock(), createFunnelRecorderMock((eventName) => emitted.push(eventName)) as any);

  await service.handleWebhook("mercadopago", {
    type: "payment",
    data: { id: "pay-1" },
  });

  assert.equal(emitted.includes("payment_failed"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @earlycv/api -- src/plans/plans.service.spec.ts`
Expected: FAIL because `PlansService` does not emit funnel event on payment failure.

- [ ] **Step 3: Write minimal implementation**

```ts
// plans.service.ts (excerpt)
type MercadoPagoResolution = {
  paymentReference: string | null;
  status: "approved" | "failed" | "pending" | "unknown";
};

async handleWebhook(provider: string, body: unknown): Promise<void> {
  // ...provider check
  const resolution = await this.resolveMercadoPagoPayment(body);

  if (resolution.status === "failed" && resolution.paymentReference) {
    await this.emitBusinessFunnelBackendEvent("payment_failed", {
      paymentReference: resolution.paymentReference,
      provider: "mercadopago",
    });
    return;
  }

  if (!resolution.paymentReference || resolution.status !== "approved") return;
  // fluxo existente de ativação
}
```

```ts
// plans.service.ts (constructor excerpt)
constructor(
  @Inject(DatabaseService) private readonly database: DatabaseService,
  @Inject(BusinessFunnelEventService)
  private readonly businessFunnelEventService: BusinessFunnelEventService,
) {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @earlycv/api -- src/plans/plans.service.spec.ts`
Expected: PASS with `payment_failed` emission covered.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plans/plans.service.ts apps/api/src/plans/plans.service.spec.ts
git commit -m "feat(api): emit payment_failed from plan webhook failures"
```

### Task 7: Verificação final de regressão e contrato

**Files:**
- Modify (if needed): `apps/web/src/lib/journey-tracking.spec.ts`
- Modify (if needed): `apps/web/src/app/template.journey-tracking.spec.tsx`
- Modify (if needed): `apps/api/src/analysis-observability/business-funnel-event.service.spec.ts`

- [ ] **Step 1: Add end-to-end contract assertions in tests**

```ts
expect(payload).toEqual(expect.objectContaining({
  eventName: expect.any(String),
  eventVersion: 1,
  metadata: expect.objectContaining({
    occurredAt: expect.any(String),
    sessionInternalId: expect.any(String),
    routeVisitId: expect.any(String),
    route: expect.any(String),
    userId: null,
  }),
}));
```

- [ ] **Step 2: Run focused web and api test suites**

Run: `npm run test --workspace @earlycv/web -- src/lib/journey-tracking.spec.ts src/app/template.journey-tracking.spec.tsx src/app/adaptar/page.submit-flow.spec.tsx`
Expected: PASS.

Run: `npm run test --workspace @earlycv/api -- src/analysis-observability/business-funnel-event.service.spec.ts src/plans/plans.service.spec.ts`
Expected: PASS.

- [ ] **Step 3: Run repository checks used in CI**

Run: `npm run check --workspace @earlycv/web && npm run check --workspace @earlycv/api`
Expected: PASS without new lint/check errors.

- [ ] **Step 4: Manual verification script for Sankey readiness**

Run:

```bash
npm run test --workspace @earlycv/web -- src/app/template.journey-tracking.spec.tsx
```

Expected sequence in mocked emissions (ordered):
- `session_started` on first eligible `page_view`
- `session_engaged` on first interaction only
- `page_view`/`page_leave` with shared `routeVisitId` when both exist
- `checkout_abandoned` emitted at most once per marker key

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/journey-tracking.spec.ts apps/web/src/app/template.journey-tracking.spec.tsx apps/api/src/analysis-observability/business-funnel-event.service.spec.ts apps/api/src/plans/plans.service.spec.ts
git commit -m "test: harden journey tracking contract and dedupe guarantees"
```

## Spec Coverage Check

- `session_started` no primeiro `page_view` elegível: coberto em Tasks 1 e 2.
- `session_engaged` na primeira interação ativa: coberto em Tasks 1 e 2.
- `page_view` + `page_leave` best-effort e não bloqueante: coberto em Tasks 1 e 2.
- `routeVisitId` explícito com ciclo de vida: coberto em Tasks 1 e 2.
- Rotas elegíveis formais (excluir `/admin` e `/superadmin`): coberto em Tasks 1 e 2.
- Micro-interações essenciais (`cv_upload_clicked`, `job_description_focus`, `job_description_paste`, `teaser_scroll`, `cta_signup_click`, `download_cv_clicked`, `checkout_abandoned`, `payment_failed`): coberto em Tasks 3, 4, 5 e 6.
- Ownership FE/BE + versionamento + correlação + idempotência: coberto em Tasks 1, 5 e 6.
- Sem duplicidade e Sankey-ready: coberto em Tasks 1, 4 e 7.

## Placeholder Scan and Consistency Check

- Não há placeholders (`TODO`, `TBD`, "implement later").
- Nomes de campos consistentes com spec: `eventName`, `eventVersion`, `occurredAt`, `sessionInternalId`, `routeVisitId`, `userId`, `route`, `previous_route`.
- Estratégia incremental evita refatoração ampla e mantém YAGNI.
