import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSessionUser } from "@/lib/app-session";

const mocks = vi.hoisted(() => ({
  getCurrentAppUserFromCookies: vi.fn<() => Promise<AppSessionUser | null>>(),
  getMyMasterResume: vi.fn(),
  getPublicJobBySlug: vi.fn(),
  listPublicJobs: vi.fn(),
  notFound: vi.fn<() => never>(),
  getJobMatchScore: vi.fn(),
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
vi.mock("../radar-ui", () => ({
  ScoreRing: () => <div>ring</div>,
  ScorePill: () => <span>pill</span>,
  SkillChip: () => <span>chip</span>,
  scoreTier: () => "high",
  breakdownPct: (_key: string, value: number) => value,
  scoreColor: () => "#000",
}));
vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: mocks.getCurrentAppUserFromCookies,
}));
vi.mock("@/lib/public-jobs-api", () => ({
  getPublicJobBySlug: mocks.getPublicJobBySlug,
  listPublicJobs: mocks.listPublicJobs,
}));
vi.mock("@/lib/resumes-api", () => ({
  getMyMasterResume: mocks.getMyMasterResume,
}));
vi.mock("@/lib/radar-api", () => ({
  getJobMatchScore: mocks.getJobMatchScore,
}));

import JobPage from "./page";

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

describe("/radar/[slug] analysis CTA visibility", () => {
  beforeEach(() => {
    mocks.notFound.mockReset();
    mocks.getCurrentAppUserFromCookies.mockReset();
    mocks.getPublicJobBySlug.mockReset();
    mocks.listPublicJobs.mockReset();
    mocks.getMyMasterResume.mockReset();
    mocks.getJobMatchScore.mockReset();
    mocks.useRouter.mockReturnValue({ push: vi.fn() });

    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    mocks.getPublicJobBySlug.mockResolvedValue({
      id: "job_1",
      slug: "eng-1",
      title: "Engenheiro",
      company: "EarlyCV",
      location: "Brasil",
      country: "BR",
      description: "desc",
      descriptionHtml: "<section><h2>Descricao</h2><p>desc</p></section>",
      employmentType: null,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      publishedAtSource: new Date().toISOString(),
      seniorityLevel: null,
      sourceJobUrl: "https://example.com/jobs/1",
      canonicalKey: "job-1",
      status: "active",
      workModel: null,
    });
    mocks.listPublicJobs.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 4,
    });
    mocks.getJobMatchScore.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it("usuário logado com CV master: dois botões aparecem", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());
    mocks.getMyMasterResume.mockResolvedValue({ id: "resume-1" });

    const element = await JobPage({
      params: Promise.resolve({ slug: "eng-1" }),
    });
    render(element);

    expect(screen.getByTestId("analyze-primary-btn")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Analisar com outro CV/i }),
    ).toBeInTheDocument();
  });

  it("usuário logado sem CV master: só 'Analisar com outro CV' aparece", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());
    mocks.getMyMasterResume.mockResolvedValue(null);

    const element = await JobPage({
      params: Promise.resolve({ slug: "eng-1" }),
    });
    render(element);

    expect(screen.queryByTestId("analyze-primary-btn")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Analisar com outro CV/i }),
    ).toBeInTheDocument();
  });

  it("usuário não logado: só 'Analisar com outro CV' aparece", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);

    const element = await JobPage({
      params: Promise.resolve({ slug: "eng-1" }),
    });
    render(element);

    expect(screen.queryByTestId("analyze-primary-btn")).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Analisar com outro CV/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("/entrar"));
  });
});
