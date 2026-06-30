import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAppUserFromCookiesMock = vi.hoisted(() => vi.fn());
const getRouteAccessRedirectPathMock = vi.hoisted(() => vi.fn());
const apiRequestMock = vi.hoisted(() => vi.fn());
const getMyMasterResumeMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
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

vi.mock("@/lib/app-session", () => ({
  getRouteAccessRedirectPath: getRouteAccessRedirectPathMock,
}));

vi.mock("@/lib/api-request", () => ({
  apiRequest: apiRequestMock,
}));

vi.mock("@/lib/resumes-api", () => ({
  getMyMasterResume: getMyMasterResumeMock,
}));

import MeuCvMasterPage from "./page";

const mockProfile = {
  certificationsJson: [],
  city: "São Paulo",
  contactEmail: "ana@trabalho.com",
  country: "Brasil",
  currentTitle: "Analista de Dados",
  educationJson: [],
  experiencesJson: [],
  fullName: "Ana Souza",
  headline: "Data Analyst",
  id: "profile-1",
  languagesJson: [],
  linkedinUrl: "https://www.linkedin.com/in/ana",
  phone: "+55 11 99999-0000",
  preferredLanguage: "pt-BR",
  profileFieldMetaJson: {},
  profileReadinessStatus: "partial",
  profileSuggestionsJson: [],
  professionalSummary: "Resumo pronto",
  remotePreference: "flexible",
  skillsJson: { business: [], soft: [], technical: [] },
  state: "SP",
  summary: "Resumo",
  targetSalaryMax: 15000,
  targetSalaryMin: 10000,
  userId: "user-1",
  yearsExperience: 5,
  relocationPreference: true,
};

describe("/meu-cv-master", () => {
  beforeEach(() => {
    getCurrentAppUserFromCookiesMock.mockReset();
    getRouteAccessRedirectPathMock.mockReset();
    apiRequestMock.mockReset();
    getMyMasterResumeMock.mockReset();

    getCurrentAppUserFromCookiesMock.mockResolvedValue({
      id: "user-1",
      email: "ana@earlycv.dev",
      emailVerifiedAt: new Date("2026-05-23T00:00:00.000Z").toISOString(),
      internalRole: "none",
      isStaff: false,
      name: "Ana Souza",
    });
    getRouteAccessRedirectPathMock.mockReturnValue(null);
    getMyMasterResumeMock.mockResolvedValue({
      id: "resume-1",
      title: "CV Base Ana",
      sourceFileName: "cv-ana.pdf",
      isMaster: true,
      updatedAt: "2026-06-01T10:00:00.000Z",
    });
    apiRequestMock.mockResolvedValue(
      new Response(JSON.stringify(mockProfile), { status: 200 }),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the editing shell with PDF strip and block list", async () => {
    render(await MeuCvMasterPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { name: /meu cv master/i }),
    ).toBeTruthy();
    // PDF strip shows the CV title
    expect(screen.getByText("CV Base Ana")).toBeTruthy();
    // Hint text shown when masterResume exists
    expect(screen.getByText(/substituir re-extrai/i)).toBeTruthy();
    // Blocks are collapsed by default — no inputs visible
    expect(screen.queryByRole("textbox")).toBeNull();
    // First block title visible as a button
    expect(
      screen.getByRole("button", { name: "Dados pessoais e contato" }),
    ).toBeInTheDocument();
  });

  it("opens the focused block from search params", async () => {
    render(
      await MeuCvMasterPage({
        searchParams: Promise.resolve({ focus: "resumo" }),
      }),
    );

    // resumo block opens, showing a textarea for professionalSummary
    expect(
      screen.getByRole("textbox", { name: /resumo profissional/i }),
    ).toBeInTheDocument();
    // Other blocks remain collapsed
    expect(
      screen.queryByRole("textbox", { name: /nome completo/i }),
    ).toBeNull();
  });

  it("shows the block list collapsed by default", async () => {
    render(await MeuCvMasterPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("button", { name: "Dados pessoais e contato" }),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
