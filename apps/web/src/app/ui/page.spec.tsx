import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import UIShowcase from "./page";

describe("UI showcase page", () => {
  it("renders without crashing", () => {
    render(<UIShowcase />);

    expect(screen.getByText("UI Components Showcase")).toBeTruthy();
  });
});
