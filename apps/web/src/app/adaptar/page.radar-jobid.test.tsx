import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAuthStatusMock = vi.hoisted(() => vi.fn());
const getMyMasterResumeMock = vi.hoisted(() => vi.fn());
const getPublicJobByIdMock = vi.hoisted(() => vi.fn());
const useSearchParamsMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: useSearchParamsMock,
}));

vi.mock("@/lib/public-jobs-client-api", () => ({
  getPublicJobById: getPublicJobByIdMock,
}));

vi.mock("@/components/app-header", () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/session-actions", () => ({
  getAuthStatus: getAuthStatusMock,
}));

vi.mock("@/lib/resumes-api", () => ({
  getMyMasterResume: getMyMasterResumeMock,
  getMyMasterCvExtractionStatus: vi.fn().mockResolvedValue(null),
  uploadMasterResume: vi.fn(),
}));

vi.mock("@/lib/cv-adaptation-api", () => ({
  analyzeAuthenticatedCv: vi.fn(),
  analyzeGuestCv: vi.fn(),
  emitBusinessFunnelEvent: vi.fn().mockResolvedValue(undefined),
  saveGuestPreview: vi.fn(),
}));

import AdaptarPage from "./page";

const makeRadarJob = () => ({
  canonicalKey: "job-abc",
  company: "Stefanini",
  companyWebsiteUrl: null,
  country: "BR",
  description:
    "Descrição completa da vaga carregada do Radar de Oportunidades.",
  descriptionHtml: "<p>Descrição completa</p>",
  employmentType: "clt",
  firstSeenAt: new Date().toISOString(),
  id: "job-abc",
  lastSeenAt: new Date().toISOString(),
  location: "São Paulo, SP",
  publishedAtSource: null,
  seniorityLevel: "junior",
  slug: "engenheiro-de-dados-jr-stefanini-job-abc",
  sourceJobUrl: "https://example.com/vaga",
  status: "active",
  title: "Engenheiro de Dados Jr",
  workModel: "remote",
});

describe("AdaptarPage radar jobId prefill", () => {
  beforeEach(() => {
    getAuthStatusMock.mockReset();
    getMyMasterResumeMock.mockReset();
    getPublicJobByIdMock.mockReset();
    useSearchParamsMock.mockReset();

    getAuthStatusMock.mockResolvedValue({
      userName: "Ana",
      profileReadinessStatus: "partial",
    });
    getMyMasterResumeMock.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it("with a valid jobId in the URL: chega fechada (sem banner), mostrando só título · empresa até expandir", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("jobId=job-abc"));
    getPublicJobByIdMock.mockResolvedValue(makeRadarJob());

    render(<AdaptarPage />);

    const collapsedToggle = await screen.findByText(
      /Engenheiro de Dados Jr · Stefanini/i,
    );
    expect(collapsedToggle).toBeTruthy();
    expect(screen.getByText(/ver descrição completa/i)).toBeTruthy();

    // O banner verde antigo não existe mais nesse fluxo.
    expect(
      screen.queryByText(/Descrição carregada automaticamente/i),
    ).toBeNull();
    expect(screen.queryByPlaceholderText(/cole a vaga completa/i)).toBeNull();

    collapsedToggle.click();

    const textarea = (await screen.findByPlaceholderText(
      /cole a vaga completa/i,
    )) as HTMLTextAreaElement;

    await waitFor(() => {
      expect(textarea.value).toContain(
        "Descrição completa da vaga carregada do Radar de Oportunidades.",
      );
    });

    expect(getPublicJobByIdMock).toHaveBeenCalledWith("job-abc");
  });

  it("with an invalid/unavailable jobId: ignora silenciosamente e mantém o campo vazio", async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("jobId=job-missing"),
    );
    getPublicJobByIdMock.mockResolvedValue(null);

    render(<AdaptarPage />);

    const textarea = (await screen.findByPlaceholderText(
      /cole a vaga completa/i,
    )) as HTMLTextAreaElement;

    await waitFor(() => {
      expect(getPublicJobByIdMock).toHaveBeenCalledWith("job-missing");
    });

    expect(textarea.value).toBe("");
    expect(
      screen.queryByText(/Descrição carregada automaticamente/i),
    ).toBeNull();
  });

  it("without jobId in the URL: preserva o comportamento atual (campo vazio, sem fetch)", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams());

    render(<AdaptarPage />);

    const textarea = (await screen.findByPlaceholderText(
      /cole a vaga completa/i,
    )) as HTMLTextAreaElement;

    expect(textarea.value).toBe("");
    expect(getPublicJobByIdMock).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/Descrição carregada automaticamente/i),
    ).toBeNull();
  });
});
