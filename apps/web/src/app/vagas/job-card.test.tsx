import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useRouter: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: mocks.useRouter }));

import type { MatchBreakdownDetails, PublicJob } from "@/lib/public-jobs-api";
import { JobCard } from "./job-card";

function buildJob(overrides: Partial<PublicJob> = {}): PublicJob {
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
    technologies: ["python", "kubernetes", "openshift"],
    workModel: "remote",
    isSaved: false,
    ...overrides,
  };
}

function buildDetails(
  overrides: Partial<MatchBreakdownDetails> = {},
): MatchBreakdownDetails {
  return {
    area: [{ label: "DATA_AI", ok: true }],
    skills: [
      { label: "python", ok: true },
      { label: "docker", ok: false },
    ],
    seniority: [{ label: "SENIOR", ok: true }],
    technologies: [
      { label: "python", ok: true },
      { label: "kubernetes", ok: false },
    ],
    ...overrides,
  };
}

describe("JobCard keyword badges", () => {
  beforeEach(() => {
    mocks.useRouter.mockReturnValue({ push: vi.fn() });
  });

  afterEach(() => {
    cleanup();
  });

  it("does not render a duplicate technologies row below the top badges when there is no computed score", () => {
    const job = buildJob();

    const { container } = render(
      <JobCard
        job={job}
        adaptarHref="/entrar?tab=cadastrar"
        showScore={false}
        isLoggedIn={false}
      />,
    );

    const pythonMentions = Array.from(container.querySelectorAll("span")).filter(
      (el) => el.textContent === "python",
    );
    expect(pythonMentions).toHaveLength(1);
  });

  it("renders the clickable score breakdown panel when hasScore and breakdownDetails are present", () => {
    const job = buildJob({
      score: 79,
      breakdown: {
        area: 25,
        skills: 15,
        seniority: 20,
        technologies: 8,
        language: 5,
        workModel: 5,
      },
      breakdownDetails: buildDetails(),
    });

    render(
      <JobCard job={job} adaptarHref="/adaptar" showScore isLoggedIn />,
    );

    // Fechado por padrão — nenhum chip "docker"/"kubernetes" visível ainda.
    expect(screen.queryAllByText("docker")).toHaveLength(0);

    // Desktop e mobile renderizam ambos no DOM (alternados só por CSS
    // @media, sem detecção de viewport em JS) — pega o primeiro botão
    // "skills" (o da grade desktop) pra não ambiguar a query.
    fireEvent.click(screen.getAllByRole("button", { name: /skills/ })[0]);

    expect(screen.getAllByText("docker").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 de 2 no seu CV").length).toBeGreaterThan(0);
  });
});
