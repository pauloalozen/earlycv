import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAppUserFromCookies: vi.fn(),
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
  AdaptBtn: () => <a href="#adaptar">adaptar</a>,
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

import JobPage, { generateMetadata } from "./page";

function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job_1",
    slug: "engenheiro-de-dados-earlycv-job1",
    title: "Engenheiro de Dados",
    company: "EarlyCV",
    companyWebsiteUrl: "https://earlycv.com.br",
    location: "São Paulo, Brasil",
    country: "BR",
    description: "Descrição completa da vaga.",
    descriptionHtml: "<section><h2>Descricao</h2><p>desc</p></section>",
    employmentType: "full_time",
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    lastSeenAt: "2026-08-05T00:00:00.000Z",
    publishedAtSource: "2026-08-01T00:00:00.000Z",
    seniorityLevel: null,
    sourceJobUrl: "https://example.com/jobs/1",
    canonicalKey: "job-1",
    status: "active",
    technologies: ["python", "sql", "airflow", "spark"],
    workModel: "remote",
    ...overrides,
  };
}

describe("/vagas/[slug] generateMetadata", () => {
  beforeEach(() => {
    mocks.getPublicJobBySlug.mockReset();
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "false";
  });

  it("returns a title with the job title and company", async () => {
    mocks.getPublicJobBySlug.mockResolvedValue(buildJob());

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "engenheiro-de-dados-earlycv-job1" }),
    });

    expect(metadata.title).toBe("Engenheiro de Dados — EarlyCV | EarlyCV");
  });

  it("returns a description with location, remote flag and tech tags, capped at 160 chars", async () => {
    mocks.getPublicJobBySlug.mockResolvedValue(buildJob());

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "engenheiro-de-dados-earlycv-job1" }),
    });

    const description = metadata.description ?? "";
    expect(description).toContain("São Paulo, Brasil");
    expect(description).toContain("(Remoto)");
    expect(description).toContain("python, sql, airflow");
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("falls back to a generic title when the job is not found", async () => {
    mocks.getPublicJobBySlug.mockResolvedValue(null);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "nao-existe" }),
    });

    expect(metadata.title).toBe("Vaga não encontrada");
  });
});

describe("/vagas/[slug] JSON-LD JobPosting", () => {
  beforeEach(() => {
    mocks.notFound.mockReset();
    mocks.getCurrentAppUserFromCookies.mockReset();
    mocks.getPublicJobBySlug.mockReset();
    mocks.listPublicJobs.mockReset();
    mocks.getMyMasterResume.mockReset();
    mocks.getJobMatchScore.mockReset();
    mocks.useRouter.mockReturnValue({ push: vi.fn() });

    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);
    mocks.listPublicJobs.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 4,
    });
    mocks.getMyMasterResume.mockResolvedValue(null);
    mocks.getJobMatchScore.mockResolvedValue(null);
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "false";
  });

  afterEach(() => {
    cleanup();
  });

  async function renderJobJsonLd(overrides: Record<string, unknown> = {}) {
    mocks.getPublicJobBySlug.mockResolvedValue(buildJob(overrides));
    const element = await JobPage({
      params: Promise.resolve({ slug: "engenheiro-de-dados-earlycv-job1" }),
    });
    const { container } = render(element as React.ReactElement);
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(script).toBeInTheDocument();
    return JSON.parse(script?.textContent ?? "{}");
  }

  it("includes the required JobPosting fields with non-empty description", async () => {
    const jsonLd = await renderJobJsonLd();

    expect(jsonLd["@type"]).toBe("JobPosting");
    expect(jsonLd.title).toBe("Engenheiro de Dados");
    expect(jsonLd.description).toBe("Descrição completa da vaga.");
    expect(jsonLd.description.length).toBeGreaterThan(0);
    expect(jsonLd.datePosted).toBe("2026-08-01T00:00:00.000Z");
    expect(jsonLd.validThrough).toBe("2026-09-04T00:00:00.000Z");
    expect(jsonLd.hiringOrganization).toEqual({
      "@type": "Organization",
      name: "EarlyCV",
      sameAs: "https://earlycv.com.br",
    });
  });

  it("falls back to a generated description when descriptionClean is empty", async () => {
    const jsonLd = await renderJobJsonLd({ description: "   " });

    expect(jsonLd.description).toBe(
      "Vaga de Engenheiro de Dados na EarlyCV. Candidate-se e adapte seu CV com IA.",
    );
  });

  it("normalizes country name to ISO 3166-1 alpha-2 (Brasil -> BR)", async () => {
    const jsonLd = await renderJobJsonLd({ country: "Brasil" });

    expect(jsonLd.jobLocation.address.addressCountry).toBe("BR");
  });

  it("falls back to BR when country is null", async () => {
    const jsonLd = await renderJobJsonLd({ country: null });

    expect(jsonLd.jobLocation.address.addressCountry).toBe("BR");
  });

  it("passes through an already-valid country value unchanged", async () => {
    const jsonLd = await renderJobJsonLd({ country: "PT" });

    expect(jsonLd.jobLocation.address.addressCountry).toBe("PT");
  });

  it("includes jobLocationType TELECOMMUTE when workModel is remote", async () => {
    const jsonLd = await renderJobJsonLd({ workModel: "remote" });

    expect(jsonLd.jobLocationType).toBe("TELECOMMUTE");
  });

  it("omits jobLocationType when workModel is not remote", async () => {
    const jsonLd = await renderJobJsonLd({ workModel: "hybrid" });

    expect(jsonLd.jobLocationType).toBeUndefined();
  });

  it("maps normalized employmentType values to schema.org enum values", async () => {
    const jsonLd = await renderJobJsonLd({ employmentType: "contractor" });

    expect(jsonLd.employmentType).toBe("CONTRACTOR");
  });

  it("omits employmentType for values with no schema.org mapping (e.g. talent_pool)", async () => {
    const jsonLd = await renderJobJsonLd({ employmentType: "talent_pool" });

    expect(jsonLd.employmentType).toBeUndefined();
  });
});
