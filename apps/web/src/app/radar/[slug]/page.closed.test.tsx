import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSessionUser } from "@/lib/app-session";
import type { ClosedPublicJob } from "@/lib/public-jobs-api";

const mocks = vi.hoisted(() => ({
  fetchClosedPublicJob: vi.fn(),
  fetchCurrentJobSlug: vi.fn(),
  fetchPublicJob: vi.fn(),
  getCurrentAppUserFromCookies: vi.fn<() => Promise<AppSessionUser | null>>(),
  listPublicJobs: vi.fn(),
  notFound: vi.fn<() => never>(),
  permanentRedirect: vi.fn<(url: string) => never>(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  permanentRedirect: mocks.permanentRedirect,
}));
vi.mock("@/components/public-footer", () => ({
  PublicFooter: () => <div>footer</div>,
}));
vi.mock("@/components/public-nav-bar", () => ({
  PublicNavBar: () => <div>nav</div>,
}));
vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: mocks.getCurrentAppUserFromCookies,
}));
vi.mock("@/lib/public-jobs-api", () => ({
  listPublicJobs: mocks.listPublicJobs,
}));
vi.mock("@/lib/public-jobs-client", () => ({
  fetchClosedPublicJob: mocks.fetchClosedPublicJob,
  fetchCurrentJobSlug: mocks.fetchCurrentJobSlug,
  fetchPublicJob: mocks.fetchPublicJob,
}));
vi.mock("@/lib/resumes-api", () => ({ getMyMasterResume: vi.fn() }));
vi.mock("@/lib/radar-api", () => ({ getJobMatchScore: vi.fn() }));
vi.mock("@/lib/plans-api", () => ({ getMyPlan: vi.fn() }));

import JobPage, { generateMetadata } from "./page";

const closedJob: ClosedPublicJob = {
  canonicalKey: "inhire:vitru:1",
  city: "São Paulo",
  company: "Vitru Educação",
  companyLogoUrl: null,
  companyWebsiteUrl: null,
  country: "BR",
  description: "Liderar a governança de TI.",
  descriptionHtml:
    "<section><h2>Responsabilidades</h2><p>Liderar a governança de TI.</p></section>",
  dominantArea: "DATA_AI",
  employmentType: "clt",
  externalJobId: "1",
  firstSeenAt: "2026-09-01T12:00:00.000Z",
  id: "job-1",
  lastSeenAt: "2026-09-30T12:00:00.000Z",
  location: "São Paulo, SP, BR",
  publishedAtSource: "2026-09-01T12:00:00.000Z",
  seniorityLevel: "senior",
  slug: "gerente-ti-vitru-1",
  state: "SP",
  status: "closed",
  technologies: [],
  title: "Gerente de Governança de TI",
  workModel: "hybrid",
};

describe("/radar/[slug] para vaga que saiu do radar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mocks.fetchPublicJob.mockResolvedValue({ status: "not-found" });
    mocks.listPublicJobs.mockResolvedValue({ data: [], total: 0 });
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);
  });

  afterEach(() => cleanup());

  it("mostra a página de vaga encerrada em vez do 404", async () => {
    mocks.fetchClosedPublicJob.mockResolvedValue({
      status: "ok",
      data: closedJob,
    });

    render(
      await JobPage({ params: Promise.resolve({ slug: closedJob.slug }) }),
    );

    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(screen.getByText("VAGA ENCERRADA")).toBeInTheDocument();
    expect(screen.getByText(/não está mais disponível/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver vagas abertas →" }),
    ).toHaveAttribute("href", "/radar");
  });

  it("continua mostrando o conteúdo da vaga, sem nenhum CTA", async () => {
    mocks.fetchClosedPublicJob.mockResolvedValue({
      status: "ok",
      data: closedJob,
    });

    render(
      await JobPage({ params: Promise.resolve({ slug: closedJob.slug }) }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: closedJob.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("Responsabilidades")).toBeInTheDocument();
    expect(screen.getByText("Liderar a governança de TI.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "");
    for (const href of hrefs) {
      expect(href).not.toMatch(/adaptar|entrar|alerta|^https?:/);
    }
  });

  it("não é indexável", async () => {
    mocks.fetchClosedPublicJob.mockResolvedValue({
      status: "ok",
      data: closedJob,
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: closedJob.slug }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.title).toEqual({
      absolute: `Vaga encerrada: ${closedJob.title} na ${closedJob.company} | EarlyCV`,
    });
    // Canonical e og:url na própria vaga (nunca herdados da home).
    const url = `https://earlycv.com.br/radar/${closedJob.slug}`;
    expect(metadata.alternates?.canonical).toBe(url);
    expect(metadata.openGraph?.url).toBe(url);
  });

  it("logado vê o aviso de que a candidatura continua salva", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue({
      id: "user-1",
      email: "user@earlycv.dev",
      name: "User",
      internalRole: "none",
      isStaff: false,
      emailVerifiedAt: null,
    } as AppSessionUser);
    mocks.fetchClosedPublicJob.mockResolvedValue({
      status: "ok",
      data: closedJob,
    });

    render(
      await JobPage({ params: Promise.resolve({ slug: closedJob.slug }) }),
    );

    expect(screen.getByText(/nada foi apagado/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Minhas candidaturas →" }),
    ).toHaveAttribute("href", "/candidaturas");
  });

  it("continua 404 quando a vaga não existe em lugar nenhum", async () => {
    mocks.fetchClosedPublicJob.mockResolvedValue({ status: "not-found" });

    await expect(
      JobPage({ params: Promise.resolve({ slug: "nao-existe" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("slug antigo de vaga com slug regenerado vira 308 para o slug atual", async () => {
    mocks.fetchClosedPublicJob.mockResolvedValue({ status: "not-found" });
    mocks.fetchCurrentJobSlug.mockResolvedValue({
      status: "ok",
      data: { slug: "dev-java-acme-cmg1abcdefghijklmnopqrstu" },
    });
    mocks.permanentRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      JobPage({
        params: Promise.resolve({
          slug: "job-1-dev-java-acme-cmg1abcdefghijklmnopqrstu",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.permanentRedirect).toHaveBeenCalledWith(
      "/radar/dev-java-acme-cmg1abcdefghijklmnopqrstu",
    );
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("falha ao buscar o slug atual não derruba o 404", async () => {
    mocks.fetchClosedPublicJob.mockResolvedValue({ status: "not-found" });
    mocks.fetchCurrentJobSlug.mockRejectedValue(new Error("timeout"));

    await expect(
      JobPage({ params: Promise.resolve({ slug: "nao-existe" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.permanentRedirect).not.toHaveBeenCalled();
  });
});
