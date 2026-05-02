import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { BlogCard } from "./blog-card";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("BlogCard", () => {
  it("renders main tag when provided and shows explicit slug link", () => {
    render(
      <BlogCard
        post={{
          body: "",
          category: "Curriculo",
          description: "Descricao",
          excerpt: "",
          featured: false,
          mainTag: "Guia pratico",
          publishedAt: "2026-05-01",
          readingTime: "6 min",
          seoDescription: "",
          seoTitle: "",
          slug: "como-adaptar-curriculo-para-vaga",
          sourcePath: "",
          status: "published",
          tags: ["curriculo"],
          title: "Titulo",
          updatedAt: "2026-05-01",
        }}
      />,
    );

    expect(screen.getByText("Guia pratico")).toBeTruthy();
    const links = screen.getAllByRole("link");
    const cardLink = links.find(
      (el) =>
        el.getAttribute("href") === "/blog/como-adaptar-curriculo-para-vaga",
    );
    expect(cardLink).toBeTruthy();
  });
});
