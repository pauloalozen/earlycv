import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAppUserFromCookiesMock = vi.hoisted(() => vi.fn());
const getMyPlanMock = vi.hoisted(() => vi.fn());
const listJobApplicationHighlightsMock = vi.hoisted(() => vi.fn());
const getMyMasterResumeMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: getCurrentAppUserFromCookiesMock,
}));

vi.mock("@/lib/plans-api", () => ({
  getMyPlan: getMyPlanMock,
}));

vi.mock("@/lib/job-applications-api", () => ({
  listJobApplicationHighlights: listJobApplicationHighlightsMock,
}));

vi.mock("@/lib/resumes-api", () => ({
  getMyMasterResume: getMyMasterResumeMock,
}));

import MeuPerfilPage from "./page";

describe("/meu-perfil", () => {
  beforeEach(() => {
    getCurrentAppUserFromCookiesMock.mockReset();
    getMyPlanMock.mockReset();
    listJobApplicationHighlightsMock.mockReset();
    getMyMasterResumeMock.mockReset();

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
        bestCvAdaptationId: null,
        bestCvState: "missing",
        scorePresentation: "not_analyzed",
      },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the hub with the reference composition", async () => {
    render(await MeuPerfilPage());

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
    expect(screen.getByText(/vagas analisadas/i)).toBeTruthy();
    expect(screen.getByText(/melhoria recente/i)).toBeTruthy();
    expect(screen.getByText(/score médio/i)).toBeTruthy();
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
});
