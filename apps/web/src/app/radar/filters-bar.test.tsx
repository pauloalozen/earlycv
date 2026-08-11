import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useRouter: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: mocks.useRouter }));

import { FiltersBar } from "./filters-bar";

describe("FiltersBar responsive layout", () => {
  beforeEach(() => {
    mocks.useRouter.mockReturnValue({ push: vi.fn() });
  });

  afterEach(() => cleanup());

  it("renders both a desktop row and a mobile stacked layout, neither with inline display (would break the CSS @media toggle)", () => {
    const { container } = render(
      <FiltersBar facets={null} activeFilters={{}} />,
    );

    const desktop = container.querySelector<HTMLElement>(
      ".vagas-filters-desktop",
    );
    const mobile = container.querySelector<HTMLElement>(
      ".vagas-filters-mobile",
    );
    expect(desktop).toBeInTheDocument();
    expect(mobile).toBeInTheDocument();
    expect(desktop?.style.display).toBe("");
    expect(mobile?.style.display).toBe("");
    expect(container.querySelector("style")?.textContent).toContain(
      "@media (max-width: 640px)",
    );
  });

  it("shows a pending-filter count badge on the mobile apply button once a filter is active", () => {
    // jsdom não avalia @media, então a regra base ".vagas-filters-mobile {
    // display: none }" já deixa esse bloco fora da árvore de acessibilidade
    // por padrão (RTL exclui elementos display:none) — por isso a
    // verificação usa querySelector no container, não getByRole/screen.
    const { container } = render(
      <FiltersBar
        facets={{
          workModels: [{ value: "remote", count: 3 }],
          areas: [],
          seniorities: [],
          companies: [],
          states: [],
          cities: [],
        }}
        activeFilters={{ modalidade: "remote" }}
      />,
    );

    const mobileApplyBtn = container.querySelector<HTMLButtonElement>(
      '.vagas-filters-mobile-pills button[type="submit"]',
    );
    expect(mobileApplyBtn?.getAttribute("aria-label")).toContain("(1)");
  });
});
