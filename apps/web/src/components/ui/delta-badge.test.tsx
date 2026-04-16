import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeltaBadge } from "./delta-badge";

describe("DeltaBadge", () => {
  it("renders +5 as green/lime badge", () => {
    render(<DeltaBadge delta={5} />);
    const badge = screen.getByText("+5 pts");
    expect(badge).not.toBeNull();
    expect(badge.className).toContain("bg-lime-100");
    expect(badge.className).toContain("text-lime-700");
  });

  it("renders -3 as red/orange badge", () => {
    render(<DeltaBadge delta={-3} />);
    const badge = screen.getByText("-3 pts");
    expect(badge).not.toBeNull();
    expect(badge.className).toContain("bg-orange-100");
    expect(badge.className).toContain("text-orange-700");
  });

  it("renders 0 as gray badge", () => {
    render(<DeltaBadge delta={0} />);
    const badge = screen.getByText("0 pts");
    expect(badge).not.toBeNull();
    expect(badge.className).toContain("bg-stone-200");
    expect(badge.className).toContain("text-stone-700");
  });
});
