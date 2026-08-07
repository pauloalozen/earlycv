import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useRouter: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: mocks.useRouter }));

import type { PublicJob } from "@/lib/public-jobs-api";
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

describe("JobCard keyword badges", () => {
  beforeEach(() => {
    mocks.useRouter.mockReturnValue({ push: vi.fn() });
  });

  afterEach(() => {
    cleanup();
  });

  it("bottom skill chips mirror the same technologies shown in the top badges, colored by match", () => {
    const job = buildJob({
      score: 79,
      matchedSkills: ["python", "openshift"],
      missingSkills: ["docker", "terraform", "helm"],
      breakdown: {
        area: 100,
        skills: 66,
        seniority: 100,
        technologies: 66,
        language: 100,
        workModel: 100,
      },
    });

    const { container } = render(
      <JobCard
        job={job}
        adaptarHref="/adaptar"
        showScore
        isLoggedIn
      />,
    );

    const allSpans = Array.from(container.querySelectorAll("span"));
    // SkillChip inclui um ícone com <title> dentro do span quando have=true
    // (ex.: "Você tem" + "python" concatenados no textContent) — por isso
    // comparação por sufixo, não igualdade exata.
    const countChip = (tech: string) =>
      allSpans.filter((el) => el.textContent?.trim().endsWith(tech)).length;

    // "python", "kubernetes", "openshift" devem aparecer 2x cada — uma vez
    // nos badges do topo, outra na fileira de baixo — nunca uma palavra
    // diferente entre as duas (era o bug: baixo vinha de
    // matchedSkills/missingSkills, um campo diferente de technologies).
    expect(countChip("python")).toBe(2);
    expect(countChip("kubernetes")).toBe(2);
    expect(countChip("openshift")).toBe(2);
    expect(countChip("docker")).toBe(0);
    expect(countChip("terraform")).toBe(0);
  });

  it("does not render the bottom skill-chip row when there is no computed score", () => {
    const job = buildJob({
      matchedSkills: undefined,
      missingSkills: undefined,
    });

    const { container } = render(
      <JobCard
        job={job}
        adaptarHref="/entrar?tab=cadastrar"
        showScore={false}
        isLoggedIn={false}
      />,
    );

    // Só os badges do topo devem existir — sem chips duplicados embaixo.
    const pythonMentions = Array.from(container.querySelectorAll("span")).filter(
      (el) => el.textContent === "python",
    );
    expect(pythonMentions).toHaveLength(1);
  });
});
