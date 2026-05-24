import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSessionUser } from "@/lib/app-session";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn<() => never>(),
  getCurrentAppUserFromCookies: vi.fn<() => Promise<AppSessionUser | null>>(),
  getPublicJobFacets: vi.fn(),
  getMyMasterResume: vi.fn(),
  listPublicJobs: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/public-footer", () => ({
  PublicFooter: () => <div>footer</div>,
}));
vi.mock("@/components/public-nav-bar", () => ({
  PublicNavBar: () => <div>nav</div>,
}));
vi.mock("./filters-sidebar", () => ({
  FiltersSidebar: () => <div>filters</div>,
}));
vi.mock("./job-score-widget", () => ({
  JobScoreWidget: () => <div>score</div>,
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

describe("/vagas ghost mode access", () => {
  const previousGhost = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

  beforeEach(() => {
    mocks.notFound.mockReset();
    mocks.getCurrentAppUserFromCookies.mockReset();
    mocks.getPublicJobFacets.mockReset();
    mocks.listPublicJobs.mockReset();
    mocks.getMyMasterResume.mockReset();

    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    mocks.listPublicJobs.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    mocks.getPublicJobFacets.mockResolvedValue({
      workModels: [],
      seniorityLevels: [],
      companies: [],
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

    const result = await VagasPage({ searchParams: Promise.resolve({}) });

    expect(result).toBeDefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("ghost ON allows superadmin", async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(
      buildUser({ internalRole: "superadmin", isStaff: true }),
    );

    const result = await VagasPage({ searchParams: Promise.resolve({}) });

    expect(result).toBeDefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("ghost ON returns notFound for regular user", async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());

    await expect(
      VagasPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("ghost ON returns notFound for anonymous", async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);

    await expect(
      VagasPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("ghost OFF allows anonymous", async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "false";
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);

    const result = await VagasPage({ searchParams: Promise.resolve({}) });

    expect(result).toBeDefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
