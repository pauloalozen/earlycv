import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSessionUser } from "@/lib/app-session";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn<() => never>(),
  getCurrentAppUserFromCookies: vi.fn<() => Promise<AppSessionUser | null>>(),
  getPublicJobFacets: vi.fn(),
  getMyMasterResume: vi.fn(),
  listPublicJobs: vi.fn(),
  getMyRadarProfile: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: mocks.useRouter,
}));
vi.mock("@/components/public-footer", () => ({
  PublicFooter: () => <div>footer</div>,
}));
vi.mock("@/components/public-nav-bar", () => ({
  PublicNavBar: () => <div>nav</div>,
}));
vi.mock("./filters-bar", () => ({
  FiltersBar: () => <div>filters</div>,
}));
vi.mock("./carousel", () => ({
  Carousel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("./save-job-btn", () => ({
  SaveJobBtn: () => <button type="button">salvar</button>,
}));
vi.mock("./radar-ui", () => ({
  ScoreRing: () => <div>ring</div>,
  ScorePill: () => <span>pill</span>,
  MiniBar: () => <div>bar</div>,
  SkillChip: () => <span>chip</span>,
  AdaptBtn: () => <a href="#adaptar">adaptar</a>,
  breakdownPct: (_key: string, value: number) => value,
  scoreTier: (value: number) =>
    value >= 70 ? "high" : value >= 40 ? "mid" : "low",
  SCORE: {
    high: {
      fg: "#1f7a34",
      bg: "rgba(34,163,72,0.14)",
      ring: "#2fa84c",
      label: "alta oportunidade",
    },
    mid: {
      fg: "#966615",
      bg: "rgba(217,163,34,0.16)",
      ring: "#d9a322",
      label: "oportunidade média",
    },
    low: {
      fg: "#c2410c",
      bg: "rgba(249,115,22,0.14)",
      ring: "#f97316",
      label: "oportunidade baixa",
    },
  },
  RADAR_AREA_LABELS: { DATA_AI: "Dados & IA" },
  RADAR_SENIORITY_LABELS: { SENIOR: "sênior" },
}));
vi.mock("./radar-profile-editor", () => ({
  RadarProfileEditor: () => <div data-testid="radar-profile-editor-mock" />,
}));
vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: mocks.getCurrentAppUserFromCookies,
}));
vi.mock("@/lib/public-jobs-api", () => ({
  getPublicJobFacets: mocks.getPublicJobFacets,
  listPublicJobs: mocks.listPublicJobs,
}));
vi.mock("@/lib/resumes-api", () => ({
  getMyMasterResume: mocks.getMyMasterResume,
}));
vi.mock("@/lib/radar-api", () => ({
  getMyRadarProfile: mocks.getMyRadarProfile,
}));

import VagasPage from "./page";

function buildUser(overrides: Partial<AppSessionUser> = {}): AppSessionUser {
  return {
    id: "user-1",
    email: "user@earlycv.dev",
    name: "User",
    internalRole: "none",
    isStaff: false,
    emailVerifiedAt: new Date("2026-05-23T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function buildRadarProfile(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    areas: ["DATA_AI"],
    seniority: "SENIOR",
    skills: [],
    technologies: [],
    languages: [],
    certifications: [],
    careerFingerprint: [],
    preferredWorkModels: [],
    preferredContractTypes: [],
    openToRelocation: false,
    salaryExpectationMin: null,
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Mesmo tree walker usado em page.ghost-mode.test.tsx: "renderiza" a árvore
// de React elements retornada por VagasPage() sem um renderer real,
// procurando pelo marcador mockado do RadarProfileEditor.
type ElementLike = { type: unknown; props?: Record<string, unknown> };

function isElementLike(value: unknown): value is ElementLike {
  return typeof value === "object" && value !== null && "type" in value;
}

function containsTestId(node: unknown, testId: string): boolean {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) {
    return node.some((item) => containsTestId(item, testId));
  }
  if (!isElementLike(node)) return false;

  if (node.props?.["data-testid"] === testId) {
    return true;
  }
  if (typeof node.type === "function") {
    const rendered = (node.type as (props: unknown) => unknown)(node.props);
    return containsTestId(rendered, testId);
  }
  if (node.props?.children) {
    return containsTestId(node.props.children, testId);
  }
  return false;
}

describe("/vagas — botão de ajuste de perfil do Radar (abre modal)", () => {
  const previousGhost = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "false";
    mocks.notFound.mockReset();
    mocks.getCurrentAppUserFromCookies.mockReset();
    mocks.getPublicJobFacets.mockReset();
    mocks.listPublicJobs.mockReset();
    mocks.getMyMasterResume.mockReset();
    mocks.getMyRadarProfile.mockReset();
    mocks.useRouter.mockReturnValue({ push: vi.fn() });

    mocks.getPublicJobFacets.mockResolvedValue({
      workModels: [],
      seniorityLevels: [],
      companies: [],
    });
    mocks.listPublicJobs.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    mocks.getMyMasterResume.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = previousGhost;
  });

  it("botão de ajuste de áreas aparece para usuário logado com UserRadarProfile existente", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());
    mocks.getMyRadarProfile.mockResolvedValue(buildRadarProfile());

    const result = await VagasPage({ searchParams: Promise.resolve({}) });

    expect(containsTestId(result, "radar-profile-editor-mock")).toBe(true);
  });

  it("não aparece para usuário logado sem UserRadarProfile", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());
    mocks.getMyRadarProfile.mockResolvedValue(null);

    const result = await VagasPage({ searchParams: Promise.resolve({}) });

    expect(containsTestId(result, "radar-profile-editor-mock")).toBe(false);
  });

  it("não aparece para usuário anônimo", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);

    const result = await VagasPage({ searchParams: Promise.resolve({}) });

    expect(containsTestId(result, "radar-profile-editor-mock")).toBe(false);
    expect(mocks.getMyRadarProfile).not.toHaveBeenCalled();
  });
});
