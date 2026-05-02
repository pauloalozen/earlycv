import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeoBackToAreasFab } from "./seo-back-to-areas-fab";
import { SeoKeywordAreaNav } from "./seo-keyword-area-nav";
import { SeoKeywordHub } from "./seo-keyword-hub";

const groups = [
  {
    area: "Tecnologia",
    description: "desc",
    roles: [
      {
        title: "Dev Backend",
        keywords: [
          {
            term: "APIs REST",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando integrou APIs",
          },
        ],
      },
    ],
  },
  {
    area: "Vendas",
    description: "desc",
    roles: [
      {
        title: "SDR",
        keywords: [
          {
            term: "Prospeccao",
            whereToUse: "Experiencia",
            whenItMakesSense: "Quando prospectou",
          },
        ],
      },
    ],
  },
] as const;

describe("SeoKeyword area navigation", () => {
  it("renders area picker block and links", () => {
    render(<SeoKeywordAreaNav groups={[...groups]} />);

    expect(screen.getByText("Escolha sua área")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Tecnologia" }).getAttribute("href"),
    ).toBe("#tecnologia");
    expect(
      screen.getByRole("link", { name: "Vendas" }).getAttribute("href"),
    ).toBe("#vendas");
  });

  it("renders area ids and keeps keyword content in document", () => {
    render(<SeoKeywordHub groups={[...groups]} />);

    expect(document.getElementById("tecnologia")).not.toBeNull();
    expect(document.getElementById("vendas")).not.toBeNull();
    expect(screen.getByText("APIs REST")).toBeTruthy();
    expect(screen.getByText("Prospeccao")).toBeTruthy();
    expect(screen.getAllByText("Voltar para áreas").length).toBeGreaterThan(0);
  });

  it("renders floating shortcut back to #areas", () => {
    render(<SeoBackToAreasFab />);
    expect(
      screen
        .getByRole("link", { name: "Voltar para escolha de area" })
        .getAttribute("href"),
    ).toBe("#areas");
  });
});
