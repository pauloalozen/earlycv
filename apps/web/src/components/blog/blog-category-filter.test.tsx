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
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Todos",
      "Curriculo",
      "Carreira",
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
      />,
    );

    expect(
      screen.getByRole("link", { name: "Curriculo" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Todos" }).getAttribute("aria-current"),
    ).toBeNull();
  });
});
