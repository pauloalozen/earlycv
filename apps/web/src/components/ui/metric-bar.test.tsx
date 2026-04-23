import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetricBar } from "./metric-bar";

describe("MetricBar", () => {
  it("renders value marker and metric test id", () => {
    render(<MetricBar label="Metric" value={72} />);
    expect(screen.getByText("72")).not.toBeNull();
    expect(screen.getByTestId("metric-bar-metric")).not.toBeNull();
  });
});
