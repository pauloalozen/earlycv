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
  companies: [
    { value: "EarlyCV", count: 1 },
    { value: "SND SOLUCOES TECNOLOGIA", count: 4 },
    { value: "CI&T", count: 2 },
    { value: "AB InBev Brasil", count: 3 },
  ],
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

  it("keeps the mais filtros panel (estado/cidade/empresa/publicado há) collapsed until toggled", () => {
    const { container } = render(
      <FiltersBar facets={FACETS} activeFilters={{}} />,
    );

    const panel = container.querySelector<HTMLElement>(
      "#radar-more-filters-panel",
    );
    expect(panel?.style.gridTemplateRows).toBe("0fr");

    fireEvent.click(screen.getByRole("button", { name: /mais filtros/ }));

    expect(panel?.style.gridTemplateRows).toBe("1fr");
    expect(screen.getByText("ESTADO")).toBeInTheDocument();
    expect(screen.getByText("CIDADE")).toBeInTheDocument();
    expect(screen.getByText("EMPRESA")).toBeInTheDocument();
    expect(screen.getByText("PUBLICADO HÁ")).toBeInTheDocument();
  });

  it("has exactly one apply button (icon, in the top row) — no second text button in the panel", () => {
    render(<FiltersBar facets={FACETS} activeFilters={{}} />);

    fireEvent.click(screen.getByRole("button", { name: /mais filtros/ }));

    const applyButtons = screen.getAllByRole("button", {
      name: "aplicar filtros",
    });
    expect(applyButtons).toHaveLength(1);
  });

  it("selecting a filter does not navigate immediately — only the apply button does", () => {
    render(<FiltersBar facets={FACETS} activeFilters={{}} />);

    fireEvent.click(screen.getByText("ÁREA"));
    fireEvent.click(screen.getByText("Dados & IA"));

    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "aplicar filtros" }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(new URL(url, "http://localhost").searchParams.get("area")).toBe(
      "DATA_AI",
    );
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

  it("normalizes ALL CAPS company names to Title Case in the EMPRESA dropdown, keeps short acronyms and already-mixed-case names untouched", () => {
    const { container } = render(
      <FiltersBar facets={FACETS} activeFilters={{}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /mais filtros/ }));
    fireEvent.click(screen.getByText("EMPRESA"));

    // "SND" tem 3 letras (<=4): mantém sigla em caixa alta; o resto vira
    // Title Case.
    expect(container.textContent).toContain("SND Solucoes Tecnologia");
    expect(container.textContent).not.toContain("SND SOLUCOES TECNOLOGIA");
    // sigla curta (<=4 letras): mantém caixa alta
    expect(container.textContent).toContain("CI&T");
    // já em capitalização mista (deliberada): não mexe
    expect(container.textContent).toContain("AB InBev Brasil");
  });

  it("renders the ADERÊNCIA dropdown with the 5 opportunity categories and applies it as a CSV filter", () => {
    render(<FiltersBar facets={FACETS} activeFilters={{}} />);

    fireEvent.click(screen.getByRole("button", { name: /mais filtros/ }));
    fireEvent.click(screen.getByText("ADERÊNCIA"));

    expect(screen.getByText("Excelente oportunidade")).toBeInTheDocument();
    expect(screen.getByText("Muito aderente")).toBeInTheDocument();
    expect(screen.getByText("Aderente")).toBeInTheDocument();
    expect(screen.getByText("Pouco aderente")).toBeInTheDocument();
    expect(screen.getByText("Baixa aderência")).toBeInTheDocument();
    // nível 0 ("Não recomendada") não é uma opção do filtro
    expect(screen.queryByText("Não recomendada")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Muito aderente"));
    fireEvent.click(screen.getByText("Aderente"));
    fireEvent.click(screen.getByRole("button", { name: "aplicar filtros" }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    const aderencia = new URL(url, "http://localhost").searchParams.get(
      "aderencia",
    );
    expect(aderencia?.split(",").sort()).toEqual(["3", "4"]);
  });

  it("hides the ADERÊNCIA filter when hiddenFilters includes it (no personalized score to filter by)", () => {
    render(
      <FiltersBar
        facets={FACETS}
        activeFilters={{}}
        hiddenFilters={["aderencia"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /mais filtros/ }));

    expect(screen.queryByText("ADERÊNCIA")).not.toBeInTheDocument();
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
