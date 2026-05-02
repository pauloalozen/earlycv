import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeoPageLayout } from "./seo-page-layout";

describe("SeoPageLayout", () => {
  it("does not enforce full viewport height before footer", () => {
    render(
      <SeoPageLayout>
        <div>Conteudo SEO</div>
      </SeoPageLayout>,
    );

    const content = screen.getByText("Conteudo SEO");
    const main = content.closest("main");

    expect(main).not.toBeNull();
    expect(main?.getAttribute("style")).not.toContain("min-height: 100vh");
  });

  it("contains last section margins to avoid gap before footer", () => {
    render(
      <SeoPageLayout>
        <div>Bloco final</div>
      </SeoPageLayout>,
    );

    const content = screen.getByText("Bloco final");
    const wrapper = content.parentElement;

    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("style")).toContain("display: flow-root");
  });
});
