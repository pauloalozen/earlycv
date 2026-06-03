import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CvMasterBlock } from "./cv-master-block";
import { profileBlockDefinitions } from "./profile-blocks";

describe("CvMasterBlock", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts collapsed and opens inline editing for one block only", () => {
    render(
      <CvMasterBlock
        block={profileBlockDefinitions[0]}
        defaultOpen={false}
        hasGap
        gapHint="3 campos pendentes"
        index={1}
        action={vi.fn()}
        profile={{
          city: "São Paulo",
          country: "Brasil",
          currentTitle: "Analista de Dados",
          certificationsJson: [],
          educationJson: [],
          experiencesJson: [],
          headline: "Data Analyst",
          id: "profile-1",
          languagesJson: [],
          linkedinUrl: "https://www.linkedin.com/in/ana",
          phone: "+55 11 99999-0000",
          preferredLanguage: "pt-BR",
          profileFieldMetaJson: {},
          profileReadinessStatus: "partial",
          profileSuggestionsJson: [],
          professionalSummary: "Resumo pronto",
          relocationPreference: null,
          remotePreference: "flexible",
          skillsJson: { business: [], soft: [], technical: [] },
          state: "SP",
          summary: "Resumo",
          targetSalaryMax: null,
          targetSalaryMin: null,
          userId: "user-1",
          fullName: "Ana Souza",
          yearsExperience: 5,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: /dados pessoais e contato/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/lacuna/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /dados pessoais e contato/i }),
    );

    expect(
      screen.getByRole("textbox", { name: /nome completo/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /experiências/i })).toBeNull();
  });
});
