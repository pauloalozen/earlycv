import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAppUserFromCookiesMock = vi.hoisted(() => vi.fn());
const getMyPlanMock = vi.hoisted(() => vi.fn());
const listJobApplicationHighlightsMock = vi.hoisted(() => vi.fn());
const getJobApplicationHighlightsSummaryMock = vi.hoisted(() => vi.fn());
const getMyMasterResumeMock = vi.hoisted(() => vi.fn());
const getCvAdaptationContentMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/components/app-header", () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../dashboard/guest-analysis-claimer", () => ({
  GuestAnalysisClaimer: () => <div data-testid="guest-analysis-claimer" />,
}));

vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: getCurrentAppUserFromCookiesMock,
}));

vi.mock("@/lib/plans-api", () => ({
  getMyPlan: getMyPlanMock,
}));

vi.mock("@/lib/job-applications-api", () => ({
  listJobApplicationHighlights: listJobApplicationHighlightsMock,
  getJobApplicationHighlightsSummary: getJobApplicationHighlightsSummaryMock,
}));

vi.mock("@/lib/resumes-api", () => ({
  getMyMasterResume: getMyMasterResumeMock,
}));

vi.mock("@/lib/cv-adaptation-api", () => ({
  getCvAdaptationContent: getCvAdaptationContentMock,
}));

import MeuPerfilPage from "./page";

describe("/meu-perfil", () => {
  beforeEach(() => {
    getCurrentAppUserFromCookiesMock.mockReset();
    getMyPlanMock.mockReset();
    listJobApplicationHighlightsMock.mockReset();
    getJobApplicationHighlightsSummaryMock.mockReset();
    getMyMasterResumeMock.mockReset();
    getCvAdaptationContentMock.mockReset();

    getCurrentAppUserFromCookiesMock.mockResolvedValue({
      id: "user-1",
      email: "ana@earlycv.dev",
      emailVerifiedAt: new Date("2026-05-23T00:00:00.000Z").toISOString(),
      internalRole: "none",
      isStaff: false,
      name: "Ana Souza",
    });
    getMyPlanMock.mockResolvedValue({
      planType: "pro",
      creditsRemaining: 4,
      planExpiresAt: null,
      isActive: true,
    });
    getMyMasterResumeMock.mockResolvedValue({
      id: "resume-1",
      title: "CV Base Ana",
      sourceFileName: "cv-ana.pdf",
      isMaster: true,
      updatedAt: "2026-06-01T10:00:00.000Z",
    });
    listJobApplicationHighlightsMock.mockResolvedValue([
      {
        id: "app-1",
        userId: "user-1",
        jobTitle: "Analista de Dados",
        companyName: "Data Corp",
        status: "APPLIED",
        bestScore: 82,
        currentCvAdaptationId: "adapt-1",
        bestCvAdaptationId: "adapt-1",
        bestCvState: "ready",
        scorePresentation: "scored",
      },
      {
        id: "app-2",
        userId: "user-1",
        jobTitle: "Product Analyst",
        companyName: "Produto SA",
        status: "INTERVIEW",
        bestScore: 76,
        currentCvAdaptationId: "adapt-2",
        bestCvAdaptationId: "adapt-2",
        bestCvState: "ready",
        scorePresentation: "scored",
      },
      {
        id: "app-3",
        userId: "user-1",
        jobTitle: "BI Analyst",
        companyName: "Insights Ltda",
        status: "SAVED",
        bestScore: null,
        currentCvAdaptationId: null,
        bestCvAdaptationId: null,
        bestCvState: "missing",
        scorePresentation: "not_analyzed",
      },
    ]);
    getJobApplicationHighlightsSummaryMock.mockResolvedValue({
      activeApplicationsCount: 4,
      analyzedCvsCount: 3,
      averageScore: 74,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the hub with the reference composition", async () => {
    render(await MeuPerfilPage());

    expect(screen.getByTestId("guest-analysis-claimer")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /olá, ana/i })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /comprar créditos/i })
        .getAttribute("href"),
    ).toBe("/planos");
    expect(
      screen
        .getByRole("link", { name: /abrir meu cv master/i })
        .getAttribute("href"),
    ).toBe("/meu-cv-master");
    expect(
      screen
        .getByRole("link", { name: /adaptar meu cv/i })
        .getAttribute("href"),
    ).toBe("/adaptar");
    expect(screen.getByText(/status do perfil/i)).toBeTruthy();
    expect(screen.getAllByText(/completo/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/candidaturas ativas/i)).toBeTruthy();
    expect(screen.getByText(/cvs analisados/i)).toBeTruthy();
    expect(screen.getByText(/score médio/i)).toBeTruthy();
    expect(screen.queryByText(/vagas analisadas/i)).toBeNull();
    expect(screen.queryByText(/melhoria recente/i)).toBeNull();
    expect(screen.getByText(/candidaturas recentes/i)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /analista de dados/i })
        .getAttribute("href"),
    ).toBe("/candidaturas/app-1");
    expect(screen.getAllByText(/excluir conta/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/zona de perigo/i)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("uses summary totals for KPIs while keeping the recent list on 3 highlights", async () => {
    listJobApplicationHighlightsMock.mockResolvedValue([
      {
        id: "app-1",
        userId: "user-1",
        jobTitle: "Analista de Dados",
        companyName: "Data Corp",
        status: "APPLIED",
        bestScore: 82,
        currentCvAdaptationId: "adapt-1",
        bestCvAdaptationId: "adapt-1",
        bestCvState: "ready",
        scorePresentation: "scored",
      },
      {
        id: "app-2",
        userId: "user-1",
        jobTitle: "Product Analyst",
        companyName: "Produto SA",
        status: "INTERVIEW",
        bestScore: 76,
        currentCvAdaptationId: "adapt-2",
        bestCvAdaptationId: "adapt-2",
        bestCvState: "ready",
        scorePresentation: "scored",
      },
      {
        id: "app-3",
        userId: "user-1",
        jobTitle: "BI Analyst",
        companyName: "Insights Ltda",
        status: "SAVED",
        bestScore: null,
        currentCvAdaptationId: null,
        bestCvAdaptationId: null,
        bestCvState: "missing",
        scorePresentation: "not_analyzed",
      },
    ]);
    getJobApplicationHighlightsSummaryMock.mockResolvedValue({
      activeApplicationsCount: 4,
      analyzedCvsCount: 3,
      averageScore: 74,
    });

    render(await MeuPerfilPage());

    const activeKpi = screen.getByText(/candidaturas ativas/i).closest("div");
    const analyzedKpi = screen.getByText(/cvs analisados/i).closest("div");
    const averageKpi = screen.getByText(/score médio/i).closest("div");

    expect(getJobApplicationHighlightsSummaryMock).toHaveBeenCalledTimes(1);
    expect(getJobApplicationHighlightsSummaryMock).toHaveBeenCalledWith();
    expect(within(activeKpi as HTMLElement).getByText("4")).toBeTruthy();
    expect(within(analyzedKpi as HTMLElement).getByText("3")).toBeTruthy();
    expect(within(averageKpi as HTMLElement).getByText("74%")).toBeTruthy();

    expect(
      screen.getByRole("link", { name: /analista de dados/i }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /product analyst/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /bi analyst/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /growth analyst/i })).toBeNull();
  });

  it("shows KPI load failure when summary fails but highlights still load", async () => {
    listJobApplicationHighlightsMock.mockResolvedValue([
      {
        id: "app-1",
        userId: "user-1",
        jobTitle: "Analista de Dados",
        companyName: "Data Corp",
        status: "APPLIED",
        bestScore: 82,
        currentCvAdaptationId: "adapt-1",
        bestCvAdaptationId: "adapt-1",
        bestCvState: "ready",
        scorePresentation: "scored",
      },
      {
        id: "app-2",
        userId: "user-1",
        jobTitle: "Product Analyst",
        companyName: "Produto SA",
        status: "INTERVIEW",
        bestScore: 76,
        currentCvAdaptationId: "adapt-2",
        bestCvAdaptationId: "adapt-2",
        bestCvState: "ready",
        scorePresentation: "scored",
      },
      {
        id: "app-3",
        userId: "user-1",
        jobTitle: "BI Analyst",
        companyName: "Insights Ltda",
        status: "SAVED",
        bestScore: null,
        currentCvAdaptationId: null,
        bestCvAdaptationId: null,
        bestCvState: "missing",
        scorePresentation: "not_analyzed",
      },
    ]);
    getJobApplicationHighlightsSummaryMock.mockRejectedValue(
      new Error("summary unavailable"),
    );

    render(await MeuPerfilPage());

    const errorValues = screen.getAllByText("Erro ao carregar");

    expect(errorValues).toHaveLength(3);
    expect(
      screen.getByRole("link", { name: /analista de dados/i }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /product analyst/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /bi analyst/i })).toBeTruthy();
  });

  it("falls back to legacy analysis score when bestScore is null", async () => {
    listJobApplicationHighlightsMock.mockResolvedValue([
      {
        id: "app-legacy",
        userId: "user-1",
        jobTitle: "BI Analyst",
        companyName: "Insights Ltda",
        status: "SAVED",
        bestScore: null,
        currentCvAdaptationId: "adapt-legacy-current",
        bestCvAdaptationId: "adapt-legacy",
        bestCvState: "ready",
        scorePresentation: "scored",
      },
    ]);
    getCvAdaptationContentMock.mockResolvedValue({
      id: "adapt-legacy",
      adaptedContentJson: {
        fit: {
          score: 54,
          categoria: "medio",
          headline: "",
          subheadline: "",
        },
        positivos: [{ texto: "Boa base analitica", pontos: 20 }],
        ajustes_conteudo: [
          {
            titulo: "Destacar Python no resumo",
            descricao: "",
            pontos: 20,
            dica: "",
          },
        ],
        keywords: {
          presentes: [{ kw: "SQL", pontos: 14 }],
          ausentes: [{ kw: "Python", pontos: 26 }],
        },
        comparacao: { antes: "", depois: "" },
        pontos_fortes: [],
        lacunas: [],
        melhorias_aplicadas: [],
        ats_keywords: { presentes: [], ausentes: [] },
        preview: { antes: "", depois: "" },
        projecao_melhoria: {
          score_atual: 54,
          score_pos_otimizacao: 74,
          explicacao_curta: "",
        },
        mensagem_venda: { titulo: "", subtexto: "" },
      },
    });

    render(await MeuPerfilPage());

    expect(getCvAdaptationContentMock).toHaveBeenCalledWith("adapt-legacy");
    expect(getCvAdaptationContentMock).toHaveBeenCalledTimes(1);
    const scoreMedioKpi = screen.getByText(/score médio/i).closest("div");
    const applicationRow = screen.getByRole("link", { name: /bi analyst/i });

    expect(within(scoreMedioKpi as HTMLElement).getByText("74%")).toBeTruthy();
    expect(within(applicationRow).getByText("74%")).toBeTruthy();
  });

  it("falls back to currentCvAdaptationId when bestCvAdaptationId is null", async () => {
    listJobApplicationHighlightsMock.mockResolvedValue([
      {
        id: "app-legacy-current",
        userId: "user-1",
        jobTitle: "Legacy Analyst",
        companyName: "Legacy Co",
        status: "ANALYZED",
        bestScore: null,
        currentCvAdaptationId: "adapt-current-only",
        bestCvAdaptationId: null,
        bestCvState: "missing",
        scorePresentation: "scored",
      },
    ]);
    getCvAdaptationContentMock.mockResolvedValue({
      id: "adapt-current-only",
      adaptedContentJson: {
        fit: {
          score: 49,
          categoria: "medio",
          headline: "",
          subheadline: "",
        },
        positivos: [{ texto: "Historico aderente", pontos: 18 }],
        ajustes_conteudo: [
          {
            titulo: "Ajustar resumo para a vaga",
            descricao: "",
            pontos: 17,
            dica: "",
          },
        ],
        keywords: {
          presentes: [{ kw: "SQL", pontos: 14 }],
          ausentes: [{ kw: "Python", pontos: 25 }],
        },
        comparacao: { antes: "", depois: "" },
        pontos_fortes: [],
        lacunas: [],
        melhorias_aplicadas: [],
        ats_keywords: { presentes: [], ausentes: [] },
        preview: { antes: "", depois: "" },
        projecao_melhoria: {
          score_atual: 49,
          score_pos_otimizacao: 67,
          explicacao_curta: "",
        },
        mensagem_venda: { titulo: "", subtexto: "" },
      },
    });

    render(await MeuPerfilPage());

    expect(getCvAdaptationContentMock).toHaveBeenCalledWith(
      "adapt-current-only",
    );
    const scoreMedioKpi = screen.getByText(/score médio/i).closest("div");
    const applicationRow = screen.getByRole("link", {
      name: /legacy analyst/i,
    });

    expect(within(scoreMedioKpi as HTMLElement).getByText("74%")).toBeTruthy();
    expect(within(applicationRow).getByText("74%")).toBeTruthy();
  });

  it("keeps dash when no new or legacy score exists", async () => {
    listJobApplicationHighlightsMock.mockResolvedValue([
      {
        id: "app-empty",
        userId: "user-1",
        jobTitle: "Operations Analyst",
        companyName: "Ops Co",
        status: "SAVED",
        bestScore: null,
        currentCvAdaptationId: null,
        bestCvAdaptationId: null,
        bestCvState: "missing",
        scorePresentation: "not_analyzed",
      },
    ]);
    getJobApplicationHighlightsSummaryMock.mockResolvedValue({
      activeApplicationsCount: 1,
      analyzedCvsCount: 0,
      averageScore: null,
    });
    render(await MeuPerfilPage());

    expect(getCvAdaptationContentMock).not.toHaveBeenCalled();
    const scoreMedioKpi = screen.getByText(/score médio/i).closest("div");
    const applicationRow = screen.getByRole("link", {
      name: /operations analyst/i,
    });

    expect(within(scoreMedioKpi as HTMLElement).getByText("—")).toBeTruthy();
    expect(within(applicationRow).getByText("—")).toBeTruthy();
  });
});
