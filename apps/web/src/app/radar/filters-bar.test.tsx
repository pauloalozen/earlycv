import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useRouter: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: mocks.useRouter }));

import { FiltersBar } from "./filters-bar";

const FACETS = {
  workModels: [{ value: "remote", count: 3 }],
  areas: [{ value: "DATA_AI", count: 5 }],
  seniorities: [{ value: "SENIOR", count: 2 }],
  companies: [{ value: "EarlyCV", count: 1 }],
  states: [{ value: "SP", label: "São Paulo", count: 4 }],
  cities: [{ value: "São Paulo", count: 4 }],
};

describe("FiltersBar", () => {
  let push: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    push = vi.fn();
    mocks.useRouter.mockReturnValue({ push });
  });

  afterEach(() => cleanup());

  it("renders the primary filters (busca, área, senioridade, modalidade) and the mais filtros toggle", () => {
    render(<FiltersBar facets={FACETS} activeFilters={{}} />);

    expect(
      screen.getByPlaceholderText("Cargo, tecnologia, empresa…"),
    ).toBeInTheDocument();
    expect(screen.getByText("ÁREA")).toBeInTheDocument();
    expect(screen.getByText("SENIORIDADE")).toBeInTheDocument();
    expect(screen.getByText("MODALIDADE")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mais filtros/ }),
    ).toBeInTheDocument();
  });

  it("keeps the mais filtros panel (estado/cidade/empresa/publicado há) hidden until toggled", () => {
    const { container } = render(
      <FiltersBar facets={FACETS} activeFilters={{}} />,
    );

    const panel = container.querySelector("#radar-more-filters-panel");
    expect(panel).toHaveAttribute("hidden");

    fireEvent.click(screen.getByRole("button", { name: /mais filtros/ }));

    expect(panel).not.toHaveAttribute("hidden");
    expect(screen.getByText("ESTADO")).toBeInTheDocument();
    expect(screen.getByText("CIDADE")).toBeInTheDocument();
    expect(screen.getByText("EMPRESA")).toBeInTheDocument();
    expect(screen.getByText("PUBLICADO HÁ")).toBeInTheDocument();
  });

  it("shows a count badge on mais filtros only for additional filters (estado/cidade/empresa/publicada), not área/senioridade/modalidade", () => {
    render(
      <FiltersBar
        facets={FACETS}
        activeFilters={{ area: "DATA_AI", estado: "SP" }}
      />,
    );

    const moreBtn = screen.getByRole("button", { name: /mais filtros/ });
    expect(moreBtn.textContent).toContain("1");
  });

  it("renders one removable tag per active filter value and omits the section when nothing is active", () => {
    const { rerender, container } = render(
      <FiltersBar facets={FACETS} activeFilters={{}} />,
    );
    expect(screen.queryByText("filtros ativos")).not.toBeInTheDocument();

    rerender(
      <FiltersBar
        facets={FACETS}
        activeFilters={{ area: "DATA_AI", publicada: "hoje" }}
      />,
    );

    expect(screen.getByText("filtros ativos")).toBeInTheDocument();
    expect(container.textContent).toContain("Dados & IA");
    expect(container.textContent).toContain("Últimas 24h");
  });

  it("removing an active filter tag navigates without that value", () => {
    render(
      <FiltersBar
        facets={FACETS}
        activeFilters={{ area: "DATA_AI,SOFTWARE_ENGINEERING" }}
      />,
    );

    const removeButtons = screen.getAllByLabelText(/remover filtro área/);
    fireEvent.click(removeButtons[0]);

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain("area=");
    expect(new URL(url, "http://localhost").searchParams.get("area")).not.toBe(
      "DATA_AI,SOFTWARE_ENGINEERING",
    );
  });

  it("limpar tudo clears every active filter and navigates", () => {
    render(
      <FiltersBar
        facets={FACETS}
        activeFilters={{ area: "DATA_AI", estado: "SP" }}
      />,
    );

    fireEvent.click(screen.getByText("limpar tudo"));

    expect(push).toHaveBeenCalledWith("/radar");
  });
});
