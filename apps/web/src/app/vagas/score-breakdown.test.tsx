import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { MatchBreakdown, MatchBreakdownDetails } from "@/lib/public-jobs-api";
import { ScoreBreakdownPanel } from "./score-breakdown";

const breakdown: MatchBreakdown = {
  area: 25,
  skills: 15,
  seniority: 20,
  technologies: 8,
  language: 5,
  workModel: 5,
};

const details: MatchBreakdownDetails = {
  area: [{ label: "DATA_AI", ok: true }],
  skills: [
    { label: "python", ok: true },
    { label: "docker", ok: false },
  ],
  seniority: [{ label: "SENIOR", ok: true }],
  technologies: [{ label: "python", ok: true }],
};

describe("ScoreBreakdownPanel", () => {
  afterEach(() => cleanup());

  it("renders both a desktop grid and a mobile carousel, toggled only by CSS", () => {
    const { container } = render(
      <ScoreBreakdownPanel breakdown={breakdown} details={details} />,
    );

    expect(container.querySelector(".score-bd-desktop")).toBeInTheDocument();
    expect(container.querySelector(".score-bd-mobile")).toBeInTheDocument();
    expect(container.querySelector(".score-bd-mtabs")).toBeInTheDocument();
  });

  it("animates the panel via grid-template-rows instead of mounting/unmounting instantly", () => {
    const { container } = render(
      <ScoreBreakdownPanel breakdown={breakdown} details={details} />,
    );

    const collapseWrappers = container.querySelectorAll<HTMLDivElement>(
      ".score-bd-desktop > div:nth-child(2)",
    );
    const desktopCollapse = collapseWrappers[0];
    expect(desktopCollapse.style.gridTemplateRows).toBe("0fr");

    fireEvent.click(screen.getAllByRole("button", { name: /^área/ })[0]);

    expect(desktopCollapse.style.gridTemplateRows).toBe("1fr");
  });

  it("keeps the panel content mounted while collapsing (closing the same dimension again)", () => {
    render(<ScoreBreakdownPanel breakdown={breakdown} details={details} />);

    const areaButtons = screen.getAllByRole("button", { name: /^área/ });
    fireEvent.click(areaButtons[0]);
    expect(screen.getAllByText("Dados & IA").length).toBeGreaterThan(0);

    fireEvent.click(areaButtons[0]);
    // Fecha (altura vai a 0), mas o conteúdo continua no DOM — é isso que
    // permite a transição CSS animar em vez de cortar seco.
    expect(screen.getAllByText("Dados & IA").length).toBeGreaterThan(0);
  });
});
