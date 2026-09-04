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
  OpportunityRing: () => <div>opportunity-ring</div>,
  OpportunityBadge: () => <span>opportunity-badge</span>,
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

describe("/radar/[slug] Monitor CTA under JOBS_GHOST_MODE (anonymous visitor)", () => {
  const originalGhostMode = process.env.JOBS_GHOST_MODE;
  const originalPublicGhostMode = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

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

    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);
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
    if (originalGhostMode === undefined) {
      delete process.env.JOBS_GHOST_MODE;
    } else {
      process.env.JOBS_GHOST_MODE = originalGhostMode;
    }
    if (originalPublicGhostMode === undefined) {
      delete process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;
    } else {
      process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = originalPublicGhostMode;
    }
  });

  it("shows the 'Ativar Monitor grátis' CTA when ghost mode is off", async () => {
    delete process.env.JOBS_GHOST_MODE;
    delete process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

    const element = await JobPage({
      params: Promise.resolve({ slug: "eng-1" }),
    });
    render(element);

    expect(
      screen.getAllByRole("link", { name: /Ativar Monitor grátis/i }).length,
    ).toBeGreaterThan(0);
  });

  it("hides the 'Ativar Monitor grátis' CTA while ghost mode is on — would 404 after signup otherwise", async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";

    const element = await JobPage({
      params: Promise.resolve({ slug: "eng-1" }),
    });
    render(element);

    expect(
      screen.queryByRole("link", { name: /Ativar Monitor grátis/i }),
    ).not.toBeInTheDocument();
  });
});
