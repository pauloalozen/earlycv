import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerReplaceMock = vi.fn();
const trackEventMock = vi.fn();
const getAuthStatusMock = vi.fn();
const getGuestAnalysisRawMock = vi.fn();
const clearGuestAnalysisRawMock = vi.fn();
const normalizedDataMock = {
  ajustes_conteudo: [{ descricao: "desc", pontos: 1, titulo: "titulo" }],
  ajustes: { count: 1, top: [] },
  ats_keywords: { ausentes: [], presentes: [] },
  comparacao: { antes: "antes", depois: "depois" },
  formato_cv: { ats_score: 80, campos: [], problemas: [], resumo: "ok" },
  fit: { headline: "Fit", score: 80, subheadline: "Sub" },
  keywords: {
    ausentes: [{ kw: "sql", pontos: 3 }],
    presentes: [{ kw: "python", pontos: 4 }],
  },
  lacunas: [],
  melhorias_aplicadas: [],
  mensagem_venda: { subtexto: "sub", titulo: "titulo" },
  pontos_fortes: [],
  positivos: [],
  preview: { antes: "antes", depois: "depois" },
  projecao_melhoria: {
    explicacao_curta: "exp",
    score_atual: 75,
    score_pos_otimizacao: 85,
  },
  score: {
    scoreAposLiberarBase: 85,
    scoreAtualBase: 75,
    scoreProjetadoFinal: 85,
  },
  secoes: {
    competencias: { max: 40, score: 30 },
    experiencia: { max: 40, score: 30 },
    formatacao: { max: 20, score: 15 },
  },
  vaga: { cargo: "Analista", empresa: "Empresa" },
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
}));

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/app-header", () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

vi.mock("@/components/cv-release-modal", () => ({
  CvReleaseModal: () => null,
}));

vi.mock("@/components/download-progress-overlay", () => ({
  DownloadProgressOverlay: () => null,
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

vi.mock("@/lib/session-actions", () => ({
  getAuthStatus: (...args: unknown[]) => getAuthStatusMock(...args),
}));

vi.mock("@/lib/guest-analysis-storage", () => ({
  clearGuestAnalysisRaw: (...args: unknown[]) => clearGuestAnalysisRawMock(...args),
  getGuestAnalysisRaw: (...args: unknown[]) => getGuestAnalysisRawMock(...args),
}));

vi.mock("./normalize-data", () => ({
  normalizeData: () => normalizedDataMock,
}));

import ResultadoPage from "./page";

describe("resultado unlock tracking", () => {
  function mockResultadoFetch(options?: { redeemOk?: boolean }) {
    const redeemOk = options?.redeemOk ?? true;

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/cv-adaptation/") && url.includes("/content")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            adaptedContentJson: {
              selectedMissingKeywords: ["sql"],
              vaga: { cargo: "Analista", empresa: "Empresa" },
            },
            isUnlocked: false,
            paymentStatus: "none",
          }),
        });
      }

      if (url.includes("/redeem-credit")) {
        return Promise.resolve(
          redeemOk
            ? { ok: true, json: async () => ({}) }
            : {
                ok: false,
                json: async () => ({ message: "falha" }),
                text: async () => "falha",
              },
        );
      }

      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    vi.stubGlobal("fetch", fetchMock);
  }

  beforeEach(() => {
    vi.useRealTimers();
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    routerReplaceMock.mockReset();
    clearGuestAnalysisRawMock.mockReset();

    sessionStorage.clear();
    sessionStorage.setItem("journey_session_internal_id", "session-resultado");
    sessionStorage.setItem("journey_current_route_visit_id", "visit-resultado");
    sessionStorage.setItem("journey_previous_route", "/adaptar");
  });

  afterEach(() => {
    cleanup();
  });

  it("emits cv_unlock_started on real review redeem click", async () => {
    window.history.replaceState({}, "", "/adaptar/resultado?adaptationId=adp-1");

    getAuthStatusMock.mockResolvedValue({
      isAuthenticated: true,
      userName: "User",
      hasCredits: true,
      internalRole: "none",
      availableCreditsDisplay: 3,
    });

    mockResultadoFetch({ redeemOk: true });

    render(<ResultadoPage />);

    const redeemButton = await screen.findByRole("button", {
      name: /Liberar CV com 1 crédito/i,
    });

    fireEvent.click(redeemButton);

    await waitFor(() => {
      const started = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "cv_unlock_started",
      );

      expect(started).toHaveLength(1);
      expect(started[0]?.[0]?.properties).toMatchObject({
        adaptationId: "adp-1",
        routeVisitId: "visit-resultado",
        sessionInternalId: "session-resultado",
        source_detail: "resultado",
        unlockMethod: "review_redeem",
      });
    });
  });

  it("does not emit cv_unlock_completed when redeem fails", async () => {
    window.history.replaceState({}, "", "/adaptar/resultado?adaptationId=adp-2");

    getAuthStatusMock.mockResolvedValue({
      isAuthenticated: true,
      userName: "User",
      hasCredits: true,
      internalRole: "none",
      availableCreditsDisplay: 3,
    });

    mockResultadoFetch({ redeemOk: false });

    render(<ResultadoPage />);

    const redeemButton = await screen.findByRole("button", {
      name: /Liberar CV com 1 crédito/i,
    });

    fireEvent.click(redeemButton);

    await waitFor(() => {
      const started = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "cv_unlock_started",
      );
      const completed = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "cv_unlock_completed",
      );

      expect(started).toHaveLength(1);
      expect(completed).toHaveLength(0);
    });
  });
});
