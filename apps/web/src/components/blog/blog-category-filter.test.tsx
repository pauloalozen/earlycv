import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BlogCategoryFilter } from "./blog-category-filter";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
});

describe("BlogCategoryFilter", () => {
  it("renders Todos first and links each category", () => {
    render(
      <BlogCategoryFilter
        activeCategory="Todos"
        categories={["Curriculo", "Carreira"]}
        order="desc"
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Todos",
      "Curriculo",
      "Carreira",
      "DATA ↓",
    ]);
    expect(links[0]?.getAttribute("href")).toBe("/blog");
    expect(links[1]?.getAttribute("href")).toBe("/blog?category=Curriculo");
    expect(links[2]?.getAttribute("href")).toBe("/blog?category=Carreira");
  });

  it("marks active category with aria-current", () => {
    render(
      <BlogCategoryFilter
        activeCategory="Curriculo"
        categories={["Curriculo", "Carreira"]}
        order="desc"
      />,
    );

    expect(
      screen
        .getByRole("link", { name: "Curriculo" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Todos" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("toggles the date order and preserves the active category in the link", () => {
    render(
      <BlogCategoryFilter
        activeCategory="Carreira"
        categories={["Curriculo", "Carreira"]}
        order="desc"
      />,
    );

    const sortLink = screen.getByRole("link", {
      name: "Ordenar por data crescente",
    });
    expect(sortLink.getAttribute("href")).toBe(
      "/blog?category=Carreira&order=asc",
    );
  });
});
