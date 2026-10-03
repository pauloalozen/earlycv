import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompanyFilter } from "./company-filter";

const companies = ["Acme", "BTG Pactual", "Itaú Unibanco", "Mercado Livre"];

afterEach(() => cleanup());

function openFilter(value = "", onChange = vi.fn()) {
  render(
    <CompanyFilter companies={companies} value={value} onChange={onChange} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Empresa/ }));
  return onChange;
}

describe("CompanyFilter", () => {
  it("abre com busca no topo, focada, e lista com altura máxima", () => {
    openFilter();
    const search = screen.getByRole("searchbox", { name: "Buscar empresa" });
    expect(search).toHaveFocus();
    expect(screen.getByRole("listbox", { name: "Empresas" })).toHaveStyle({
      maxHeight: "280px",
      overflowY: "auto",
    });
    expect(screen.getAllByRole("option")).toHaveLength(5);
  });

  it("filtra as empresas ao digitar, sem diferenciar acento e maiúscula", () => {
    openFilter();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "itau" },
    });
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Itaú Unibanco"]);
  });

  it("avisa quando a busca não encontra nada", () => {
    openFilter();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("Nenhuma empresa encontrada")).toBeInTheDocument();
  });

  it("selecionar uma empresa aplica o filtro e fecha a lista", () => {
    const onChange = openFilter();
    fireEvent.click(screen.getByRole("option", { name: "BTG Pactual" }));
    expect(onChange).toHaveBeenCalledWith("BTG Pactual");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("com empresa escolhida, mostra o nome e permite voltar para todas", () => {
    const onChange = openFilter("Acme");
    expect(
      screen.getByRole("button", { name: /Empresa: Acme/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Todas as empresas" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("fecha com Esc", () => {
    openFilter();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
