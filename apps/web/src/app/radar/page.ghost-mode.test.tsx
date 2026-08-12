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
// CompanyLogo é client component (useState pro fallback de logo de baixa
// resolução) — o helper findScoreRingProps abaixo anda pela árvore de
// elementos chamando o `type` de cada um diretamente, fora do ciclo real
// de render do React, o que quebra hooks. Mock evita isso, igual aos
// outros subcomponentes visuais desta suíte.
vi.mock("./company-logo", () => ({
  CompanyLogo: () => <div>logo</div>,
}));
vi.mock("./radar-ui", () => ({
  ScoreRing: (props: { value: number }) => (
    <div data-testid="score-ring" data-value={props.value}>
      ring
    </div>
  ),
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
  BREAKDOWN_MAX: {
    area: 25,
    skills: 30,
    seniority: 20,
    technologies: 15,
    language: 5,
    workModel: 5,
  },
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

describe("/radar ghost mode access", () => {
  const previousGhost = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

  beforeEach(() => {
    mocks.notFound.mockReset();
    mocks.getCurrentAppUserFromCookies.mockReset();
    mocks.getPublicJobFacets.mockReset();
    mocks.listPublicJobs.mockReset();
    mocks.getMyMasterResume.mockReset();
    mocks.getMyRadarProfile.mockReset();
    mocks.useRouter.mockReturnValue({ push: vi.fn() });

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
// manualmente até encontrar o ScoreRing mockado, capturando suas props.
type ElementLike = { type: unknown; props?: Record<string, unknown> };

function isElementLike(value: unknown): value is ElementLike {
  return typeof value === "object" && value !== null && "type" in value;
}

let scoreRingRef: unknown;

// async porque RadarJobsListing (extraído de page.tsx pra ser reaproveitado
// pelas landing pages do Radar) é um Server Component assíncrono — chamar
// node.type(node.props) nesse caso devolve uma Promise, não a árvore de
// elementos, então o walker precisa dar await antes de continuar descendo.
async function findScoreRingProps(
  node: unknown,
  results: Record<string, unknown>[] = [],
): Promise<Record<string, unknown>[]> {
  if (!node || typeof node !== "object") return results;
  if (Array.isArray(node)) {
    for (const item of node) await findScoreRingProps(item, results);
    return results;
  }
  if (!isElementLike(node)) return results;

  if (typeof node.type === "function") {
    if (node.type === scoreRingRef) {
      results.push(node.props ?? {});
      return results;
    }
    const rendered = await (node.type as (props: unknown) => unknown)(
      node.props,
    );
    await findScoreRingProps(rendered, results);
    return results;
  }
  if (node.props?.children) {
    await findScoreRingProps(node.props.children, results);
  }
  return results;
}

describe("/radar score badge (usuário logado com UserRadarProfile)", () => {
  const previousGhost = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

  beforeEach(async () => {
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

    const radarUiModule = await import("./radar-ui");
    scoreRingRef = radarUiModule.ScoreRing;
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
      companyWebsiteUrl: null,
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
      technologies: ["Python", "SQL"],
      workModel: "remote",
      ...overrides,
    };
  }

  it("usuário logado com UserRadarProfile e score vê o ring com o score real", async () => {
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
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mocks.listPublicJobs.mockResolvedValue({
      data: [buildJob({ score: 87 })],
      total: 1,
      page: 1,
      limit: 20,
      highCompatCount: 1,
    });

    const result = await VagasPage({ searchParams: Promise.resolve({}) });
    const rings = await findScoreRingProps(result);
    const cardRing = rings.find((props) => props.value === 87);

    expect(cardRing).toBeDefined();
  });

  it("usuário anônimo não vê ring de score (nenhum ScoreRing com score real)", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);
    mocks.listPublicJobs.mockResolvedValue({
      data: [buildJob()],
      total: 1,
      page: 1,
      limit: 20,
    });

    const result = await VagasPage({ searchParams: Promise.resolve({}) });
    const rings = await findScoreRingProps(result);

    // O único ScoreRing permitido pro anônimo é o decorativo e fixo (84%)
    // do card "É assim que fica" no hero de criar conta — não é o score de
    // nenhuma vaga real, é só ilustração de como fica depois de criar conta.
    const realJobRings = rings.filter((props) => props.value !== 84);
    expect(realJobRings).toHaveLength(0);
    expect(mocks.getMyRadarProfile).not.toHaveBeenCalled();
  });
});
