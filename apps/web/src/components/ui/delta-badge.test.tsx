import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeltaBadge } from "./delta-badge";

describe("DeltaBadge", () => {
  it("renders +5 as green/lime badge", () => {
    render(<DeltaBadge delta={5} />);
    const badge = screen.getByText("+5");
    expect(badge).not.toBeNull();
    expect(badge.className).toContain("bg-lime-100");
    expect(badge.className).toContain("text-lime-800");
  });

  it("renders -3 as red badge", () => {
    render(<DeltaBadge delta={-3} />);
    const badge = screen.getByText("-3");
    expect(badge).not.toBeNull();
    expect(badge.className).toContain("bg-red-100");
    expect(badge.className).toContain("text-red-700");
  });

  it("renders 0 as non-negative badge", () => {
    render(<DeltaBadge delta={0} />);
    const badge = screen.getByText("+0");
    expect(badge).not.toBeNull();
    expect(badge.className).toContain("bg-lime-100");
    expect(badge.className).toContain("text-lime-800");
  });
});
