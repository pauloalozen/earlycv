import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSessionUser } from "@/lib/app-session";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn<() => never>(),
  getCurrentAppUserFromCookies: vi.fn<() => Promise<AppSessionUser | null>>(),
  getPublicJobFacets: vi.fn(),
  getMyMasterResume: vi.fn(),
  listPublicJobs: vi.fn(),
  getMyRadarProfile: vi.fn(),
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
  JobScoreWidget: (props: {
    scoreState: string;
    match?: { score: number } | null;
  }) => (
    <div
      data-testid="job-score-widget"
      data-state={props.scoreState}
      data-score={props.match?.score ?? ""}
    >
      score
    </div>
  ),
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

describe("/vagas ghost mode access", () => {
  const previousGhost = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

  beforeEach(() => {
    mocks.notFound.mockReset();
    mocks.getCurrentAppUserFromCookies.mockReset();
    mocks.getPublicJobFacets.mockReset();
    mocks.listPublicJobs.mockReset();
    mocks.getMyMasterResume.mockReset();
    mocks.getMyRadarProfile.mockReset();

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
    mocks.getMyRadarProfile.mockResolvedValue(null);
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

// Tree walker que "renderiza" a árvore de React elements retornada por
// VagasPage() sem um renderer real (jsdom/RTL) — chama componentes função
// manualmente até encontrar o JobScoreWidget mockado, capturando suas props.
type ElementLike = { type: unknown; props?: Record<string, unknown> };

function isElementLike(value: unknown): value is ElementLike {
  return typeof value === "object" && value !== null && "type" in value;
}

let jobScoreWidgetRef: unknown;

function findJobScoreWidgetProps(
  node: unknown,
  results: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (!node || typeof node !== "object") return results;
  if (Array.isArray(node)) {
    for (const item of node) findJobScoreWidgetProps(item, results);
    return results;
  }
  if (!isElementLike(node)) return results;

  if (typeof node.type === "function") {
    if (node.type === jobScoreWidgetRef) {
      results.push(node.props ?? {});
      return results;
    }
    const rendered = (node.type as (props: unknown) => unknown)(node.props);
    findJobScoreWidgetProps(rendered, results);
    return results;
  }
  if (node.props?.children) {
    findJobScoreWidgetProps(node.props.children, results);
  }
  return results;
}

describe("/vagas score badge (usuário logado com UserRadarProfile)", () => {
  const previousGhost = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

  beforeEach(async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "false";
    mocks.notFound.mockReset();
    mocks.getCurrentAppUserFromCookies.mockReset();
    mocks.getPublicJobFacets.mockReset();
    mocks.listPublicJobs.mockReset();
    mocks.getMyMasterResume.mockReset();
    mocks.getMyRadarProfile.mockReset();
    mocks.getPublicJobFacets.mockResolvedValue({
      workModels: [],
      seniorityLevels: [],
      companies: [],
    });

    const widgetModule = await import("./job-score-widget");
    jobScoreWidgetRef = widgetModule.JobScoreWidget;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = previousGhost;
  });

  function buildJob(overrides: Record<string, unknown> = {}) {
    return {
      id: "job-1",
      slug: "vaga-empresa-job-1",
      title: "Engenheiro de Dados",
      company: "EarlyCV",
      location: "Brasil",
      country: "BR",
      description: "desc",
      descriptionHtml: "<p>desc</p>",
      employmentType: null,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      publishedAtSource: new Date().toISOString(),
      seniorityLevel: null,
      sourceJobUrl: "https://example.com/jobs/1",
      canonicalKey: "job-1",
      status: "active",
      workModel: "remote",
      ...overrides,
    };
  }

  it("usuário logado com UserRadarProfile e score vê o badge com o score real", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());
    mocks.getMyMasterResume.mockResolvedValue({
      id: "resume-1",
      title: "CV",
      sourceFileName: null,
      isMaster: true,
      updatedAt: new Date().toISOString(),
    });
    mocks.getMyRadarProfile.mockResolvedValue({
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
    });
    mocks.listPublicJobs.mockResolvedValue({
      data: [buildJob({ score: 87 })],
      total: 1,
      page: 1,
      limit: 20,
    });

    const result = await VagasPage({ searchParams: Promise.resolve({}) });
    const widgets = findJobScoreWidgetProps(result);
    const compactWidget = widgets.find((props) => props.compact) as
      | { scoreState: string; match?: { score: number } | null }
      | undefined;

    expect(compactWidget).toBeDefined();
    expect(compactWidget?.scoreState).toBe("has-cv");
    expect(compactWidget?.match?.score).toBe(87);
  });

  it("usuário anônimo não vê badge de score (match nulo, estado anonymous)", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);
    mocks.listPublicJobs.mockResolvedValue({
      data: [buildJob()],
      total: 1,
      page: 1,
      limit: 20,
    });

    const result = await VagasPage({ searchParams: Promise.resolve({}) });
    const widgets = findJobScoreWidgetProps(result);
    const compactWidget = widgets.find((props) => props.compact) as
      | { scoreState: string; match?: { score: number } | null }
      | undefined;

    expect(compactWidget).toBeDefined();
    expect(compactWidget?.scoreState).toBe("anonymous");
    expect(compactWidget?.match ?? null).toBeNull();
    expect(mocks.getMyRadarProfile).not.toHaveBeenCalled();
  });
});
