import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicFooter } from "./public-footer";

describe("PublicFooter", () => {
  it("uses mobile-safe wrapping and adaptive grid", () => {
    render(<PublicFooter />);

    const ctaButton = screen.getByRole("link", {
      name: "Começar análise grátis agora →",
    });

    const ctaStrip = ctaButton.closest("div");
    expect(ctaStrip).not.toBeNull();
    expect(ctaStrip?.getAttribute("style")).toContain("flex-wrap: wrap");

    const produtoHeading = screen.getByText("PRODUTO");
    const columnsGrid =
      produtoHeading.closest("div")?.parentElement?.parentElement;
    expect(columnsGrid).not.toBeNull();
    expect(columnsGrid?.getAttribute("style")).toContain("auto-fit");
  });
});
