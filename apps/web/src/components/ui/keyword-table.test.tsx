import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KeywordTable } from "./keyword-table";

type Keyword = {
  name: string;
  presente: boolean;
  delta: number;
};

const keywords: Keyword[] = [
  { name: "React", presente: true, delta: 2 },
  { name: "Node.js", presente: false, delta: -1 },
];

describe("KeywordTable", () => {
  it("renders keywords with status badges, delta badges, footer total, and sortable name header", () => {
    const onSort = vi.fn();
    render(&lt;
    KeywordTable;
    keywords = { keywords };
    onSort={onSort} /&gt;
    )

    // Names
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Node.js")).toBeInTheDocument();

    // Status badges
    const presenteBadge = screen.getByText("✓ presente");
    expect(presenteBadge).toBeInTheDocument();
    expect(presenteBadge.parentElement?.className).toContain("bg-emerald-100");

    const faltanteBadge = screen.getByText("✗ faltante");
    expect(faltanteBadge).toBeInTheDocument();
    expect(faltanteBadge.parentElement?.className).toContain("bg-orange-100");

    // Delta badges
    expect(screen.getByText("+2 pts")).toBeInTheDocument();
    expect(screen.getByText("-1 pts")).toBeInTheDocument();

    // Footer total
    expect(screen.getByText("Total delta")).toBeInTheDocument();
    expect(screen.getByText("+1 pts")).toBeInTheDocument();
  });

  it("calls onSort('name') when name header is clicked", () => {
    const onSort = vi.fn();
    render(&lt;
    KeywordTable;
    keywords = { keywords };
    onSort={onSort} /&gt;
    )
    fireEvent.click(screen.getByRole("button", { name: /nome/i }));
    expect(onSort).toHaveBeenCalledWith("name");
  });
});
