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
  OpportunityRing: () => <div>opportunity-ring</div>,
  OpportunityBadge: () => <span>opportunity-badge</span>,
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

// O detalhe carrega a vaga pelo cliente público (sem cookies); estes testes
// seguem controlando a vaga via getPublicJobBySlug.
vi.mock("@/lib/public-jobs-client", () => ({
  fetchPublicJob: async (slug: string) => {
    const job = await mocks.getPublicJobBySlug(slug);
    return job ? { data: job, status: "ok" } : { status: "not-found" };
  },
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
    city: "São Paulo",
    state: "SP",
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

describe("/radar/[slug] generateMetadata", () => {
  beforeEach(() => {
    mocks.getPublicJobBySlug.mockReset();
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "false";
  });

  it("returns a title with the job title and company", async () => {
    mocks.getPublicJobBySlug.mockResolvedValue(buildJob());

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "engenheiro-de-dados-earlycv-job1" }),
    });

    // absolute: o layout raiz não acrescenta outro "| EarlyCV".
    expect(metadata.title).toEqual({
      absolute: "Engenheiro de Dados na EarlyCV (Remoto) | EarlyCV",
    });
    expect(metadata.openGraph?.title).toBe(
      "Engenheiro de Dados na EarlyCV (Remoto) | EarlyCV",
    );
  });

  it("uses the city as location for non-remote jobs and strips the ATS id prefix", async () => {
    mocks.getPublicJobBySlug.mockResolvedValue(
      buildJob({
        title: "[Job-32186] Senior AI Developer",
        workModel: "hybrid",
      }),
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "engenheiro-de-dados-earlycv-job1" }),
    });

    expect(metadata.title).toEqual({
      absolute: "Senior AI Developer na EarlyCV (São Paulo) | EarlyCV",
    });
  });

  it("returns the description with company and location, without em dash, capped at 155 chars", async () => {
    mocks.getPublicJobBySlug.mockResolvedValue(buildJob());

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "engenheiro-de-dados-earlycv-job1" }),
    });

    const description = metadata.description ?? "";
    expect(description).toBe(
      "Vaga de Engenheiro de Dados na EarlyCV, Remoto. Veja grátis sua compatibilidade com a vaga e adapte seu currículo em minutos no EarlyCV.",
    );
    expect(description).not.toMatch(/[—–]/);
    expect(description.length).toBeLessThanOrEqual(155);
  });

  it("declares canonical and og:url on the job's own URL", async () => {
    mocks.getPublicJobBySlug.mockResolvedValue(buildJob());

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "engenheiro-de-dados-earlycv-job1" }),
    });

    const url = "https://earlycv.com.br/radar/engenheiro-de-dados-earlycv-job1";
    expect(metadata.alternates?.canonical).toBe(url);
    expect(metadata.openGraph?.url).toBe(url);
  });

  it("falls back to a generic title when the job is not found", async () => {
    mocks.getPublicJobBySlug.mockResolvedValue(null);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "nao-existe" }),
    });

    expect(metadata.title).toBe("Vaga não encontrada");
  });
});

describe("/radar/[slug] JSON-LD JobPosting", () => {
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

  async function renderJobPosting(overrides: Record<string, unknown> = {}) {
    mocks.getPublicJobBySlug.mockResolvedValue(buildJob(overrides));
    const element = await JobPage({
      params: Promise.resolve({ slug: "engenheiro-de-dados-earlycv-job1" }),
    });
    const { container } = render(element as React.ReactElement);
    const jobPosting = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]'),
    )
      .map((script) => JSON.parse(script.textContent ?? "{}"))
      .find((data) => data["@type"] === "JobPosting");
    return jobPosting ?? null;
  }

  async function renderJobJsonLd(overrides: Record<string, unknown> = {}) {
    const jsonLd = await renderJobPosting(overrides);
    expect(jsonLd).not.toBeNull();
    return jsonLd;
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

  it("declares directApply false (candidatura acontece no site da empresa)", async () => {
    const jsonLd = await renderJobJsonLd();

    expect(jsonLd.directApply).toBe(false);
  });

  it("falls back to a generated description when descriptionClean is empty", async () => {
    const jsonLd = await renderJobJsonLd({ description: "   " });

    expect(jsonLd.description).toBe(
      "Vaga de Engenheiro de Dados na EarlyCV. Candidate-se e adapte seu CV com IA.",
    );
  });

  it("builds jobLocation.address from city/state, with addressCountry BR for Brazilian jobs", async () => {
    const jsonLd = await renderJobJsonLd({ city: "São Paulo", state: "SP" });

    expect(jsonLd.jobLocation).toEqual({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "São Paulo",
        addressRegion: "SP",
        addressCountry: "BR",
      },
    });
  });

  it("omits addressLocality when city is null, keeps addressRegion", async () => {
    const jsonLd = await renderJobJsonLd({ city: null, state: "SP" });

    expect(jsonLd.jobLocation.address.addressLocality).toBeUndefined();
    expect(jsonLd.jobLocation.address.addressRegion).toBe("SP");
    expect(jsonLd.jobLocation.address.addressCountry).toBe("BR");
  });

  it("omits addressRegion when state is null, keeps addressLocality", async () => {
    const jsonLd = await renderJobJsonLd({ city: "São Paulo", state: null });

    expect(jsonLd.jobLocation.address.addressLocality).toBe("São Paulo");
    expect(jsonLd.jobLocation.address.addressRegion).toBeUndefined();
  });

  it("does not emit JobPosting for a non-remote job without city/state (never invents a location)", async () => {
    const jsonLd = await renderJobPosting({
      city: null,
      state: null,
      workModel: "hybrid",
    });

    expect(jsonLd).toBeNull();
  });

  it("includes jobLocationType TELECOMMUTE when workModel is remote", async () => {
    const jsonLd = await renderJobJsonLd({ workModel: "remote" });

    expect(jsonLd.jobLocationType).toBe("TELECOMMUTE");
  });

  it("for remote jobs without city/state, keeps TELECOMMUTE and omits jobLocation", async () => {
    const jsonLd = await renderJobJsonLd({
      workModel: "remote",
      city: null,
      state: null,
    });

    expect(jsonLd.jobLocationType).toBe("TELECOMMUTE");
    expect(jsonLd.jobLocation).toBeUndefined();
  });

  it("omits jobLocationType when workModel is not remote", async () => {
    const jsonLd = await renderJobJsonLd({ workModel: "hybrid" });

    expect(jsonLd.jobLocationType).toBeUndefined();
  });

  it("maps normalized employmentType values to schema.org enum values", async () => {
    const jsonLd = await renderJobJsonLd({ employmentType: "contractor" });

    expect(jsonLd.employmentType).toBe("CONTRACTOR");
  });

  it("maps raw CLT to FULL_TIME", async () => {
    const jsonLd = await renderJobJsonLd({ employmentType: "CLT" });

    expect(jsonLd.employmentType).toBe("FULL_TIME");
  });

  it("omits employmentType for values with no schema.org mapping (e.g. Homeoffice)", async () => {
    const jsonLd = await renderJobJsonLd({ employmentType: "Homeoffice" });

    expect(jsonLd.employmentType).toBeUndefined();
  });

  it("does not emit JobPosting for talent pool (banco de talentos)", async () => {
    expect(
      await renderJobPosting({ employmentType: "talent_pool" }),
    ).toBeNull();
  });

  it("does not emit JobPosting for a foreign job", async () => {
    expect(
      await renderJobPosting({
        country: "Remote; Texas",
        city: "Illinois",
        state: "USA",
      }),
    ).toBeNull();
  });

  it("declares applicantLocationRequirements only for remote jobs", async () => {
    const remote = await renderJobJsonLd({ workModel: "remote" });
    expect(remote.applicantLocationRequirements).toEqual({
      "@type": "Country",
      name: "Brasil",
    });

    cleanup();
    const hybrid = await renderJobJsonLd({ workModel: "hybrid" });
    expect(hybrid.applicantLocationRequirements).toBeUndefined();
  });

  it("uses the clean title, display company name, logo and company identifier", async () => {
    const jsonLd = await renderJobJsonLd({
      title: "[Job-32186] Senior AI Developer, Brazil",
      company: "BTG PACTUAL HOLDING DE SEGUROS LTDA.",
      companyLogoUrl: "/logos/btg.png",
      externalJobId: "38d5f5a9",
    });

    expect(jsonLd.title).toBe("Senior AI Developer, Brazil");
    expect(jsonLd.hiringOrganization.name).toBe(
      "BTG Pactual Holding de Seguros",
    );
    expect(jsonLd.hiringOrganization.logo).toBe(
      "https://earlycv.com.br/logos/btg.png",
    );
    expect(jsonLd.identifier).toEqual({
      "@type": "PropertyValue",
      name: "BTG Pactual Holding de Seguros",
      value: "38d5f5a9",
    });
  });

  it("renders a single <h1> even when the description HTML brings its own", async () => {
    mocks.getPublicJobBySlug.mockResolvedValue(
      buildJob({
        title: "[Job-1] Dev",
        descriptionHtml:
          "<h1>Les missions</h1><p>x</p><h1 class='a'>Profil</h1>",
      }),
    );
    const element = await JobPage({
      params: Promise.resolve({ slug: "engenheiro-de-dados-earlycv-job1" }),
    });
    const { container } = render(element as React.ReactElement);

    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe("Dev");
  });
});
