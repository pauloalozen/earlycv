import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetricBar } from "./metric-bar";

describe("MetricBar", () => {
  it("renders stacked bar", () => {
    const segments = [
      { name: "skills", pct: 25, color: "green" as const },
      { name: "experience", pct: 47, color: "yellow" as const },
    ];
    render(<MetricBar score={72} segments={segments} />);
    expect(screen.getByText("72%")).toBeInTheDocument();
  });
});
