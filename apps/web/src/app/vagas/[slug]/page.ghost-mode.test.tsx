import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSessionUser } from "@/lib/app-session";

const mocks = vi.hoisted(() => ({
  getCurrentAppUserFromCookies: vi.fn<() => Promise<AppSessionUser | null>>(),
  getMyMasterResume: vi.fn(),
  getPublicJobBySlug: vi.fn(),
  listPublicJobs: vi.fn(),
  notFound: vi.fn<() => never>(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/public-footer", () => ({
  PublicFooter: () => <div>footer</div>,
}));
vi.mock("@/components/public-nav-bar", () => ({
  PublicNavBar: () => <div>nav</div>,
}));
vi.mock("../job-score-widget", () => ({
  JobScoreWidget: () => <div>score</div>,
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

describe("/vagas/[slug] ghost mode access", () => {
  const previousGhost = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

  beforeEach(() => {
    mocks.notFound.mockReset();
    mocks.getCurrentAppUserFromCookies.mockReset();
    mocks.getPublicJobBySlug.mockReset();
    mocks.listPublicJobs.mockReset();
    mocks.getMyMasterResume.mockReset();

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
    mocks.getMyMasterResume.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = previousGhost;
  });

  it("ghost ON allows admin", async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(
      buildUser({ internalRole: "admin", isStaff: true }),
    );

    const result = await JobPage({
      params: Promise.resolve({ slug: "eng-1" }),
    });

    expect(result).toBeDefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("ghost ON allows superadmin", async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(
      buildUser({ internalRole: "superadmin", isStaff: true }),
    );

    const result = await JobPage({
      params: Promise.resolve({ slug: "eng-1" }),
    });

    expect(result).toBeDefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("ghost ON returns notFound for regular user", async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());

    await expect(
      JobPage({ params: Promise.resolve({ slug: "eng-1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("ghost ON returns notFound for anonymous", async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);

    await expect(
      JobPage({ params: Promise.resolve({ slug: "eng-1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("ghost OFF allows anonymous", async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "false";
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);

    const result = await JobPage({
      params: Promise.resolve({ slug: "eng-1" }),
    });

    expect(result).toBeDefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
