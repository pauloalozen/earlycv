import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSessionUser } from "@/lib/app-session";
import type { ClosedPublicJob } from "@/lib/public-jobs-api";

const mocks = vi.hoisted(() => ({
  fetchClosedPublicJob: vi.fn(),
  fetchPublicJob: vi.fn(),
  getCurrentAppUserFromCookies: vi.fn<() => Promise<AppSessionUser | null>>(),
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
vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: mocks.getCurrentAppUserFromCookies,
}));
vi.mock("@/lib/public-jobs-api", () => ({
  listPublicJobs: mocks.listPublicJobs,
}));
vi.mock("@/lib/public-jobs-client", () => ({
  fetchClosedPublicJob: mocks.fetchClosedPublicJob,
  fetchPublicJob: mocks.fetchPublicJob,
}));
vi.mock("@/lib/resumes-api", () => ({ getMyMasterResume: vi.fn() }));
vi.mock("@/lib/radar-api", () => ({ getJobMatchScore: vi.fn() }));
vi.mock("@/lib/plans-api", () => ({ getMyPlan: vi.fn() }));

import JobPage, { generateMetadata } from "./page";

const closedJob: ClosedPublicJob = {
  company: "Vitru Educação",
  companyLogoUrl: null,
  companyWebsiteUrl: null,
  dominantArea: "DATA_AI",
  lastSeenAt: "2026-09-30T12:00:00.000Z",
  location: "São Paulo, SP, BR",
  slug: "gerente-ti-vitru-1",
  status: "closed",
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

  it("não é indexável", async () => {
    mocks.fetchClosedPublicJob.mockResolvedValue({
      status: "ok",
      data: closedJob,
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: closedJob.slug }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(String(metadata.title)).toContain("Vaga encerrada");
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
      screen.getByRole("link", { name: "Minhas candidaturas" }),
    ).toHaveAttribute("href", "/candidaturas");
  });

  it("continua 404 quando a vaga não existe em lugar nenhum", async () => {
    mocks.fetchClosedPublicJob.mockResolvedValue({ status: "not-found" });

    await expect(
      JobPage({ params: Promise.resolve({ slug: "nao-existe" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
