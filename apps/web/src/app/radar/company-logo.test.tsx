import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CompanyLogo } from "./company-logo";

afterEach(() => cleanup());

describe("CompanyLogo", () => {
  it("renders the colored initial square when there is no websiteUrl", () => {
    const { container } = render(<CompanyLogo name="Earlycv" />);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.textContent).toBe("E");
  });

  it("renders the favicon img when websiteUrl is present", () => {
    const { container } = render(
      <CompanyLogo name="EarlyCV" websiteUrl="https://earlycv.com.br" />,
    );

    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img?.src).toContain("s2/favicons");
    expect(img?.src).toContain("domain=earlycv.com.br");
  });

  it("falls back to the initial square when the favicon fails to load", () => {
    const { container } = render(
      <CompanyLogo name="EarlyCV" websiteUrl="https://earlycv.com.br" />,
    );

    const img = container.querySelector("img") as HTMLImageElement;
    fireEvent.error(img);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.textContent).toBe("E");
  });

  it("falls back to the initial square when the loaded favicon is below the minimum resolution (Google's generic icon)", () => {
    const { container } = render(
      <CompanyLogo name="EarlyCV" websiteUrl="https://earlycv.com.br" />,
    );

    const img = container.querySelector("img") as HTMLImageElement;
    Object.defineProperty(img, "naturalWidth", { value: 16, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 16, configurable: true });
    fireEvent.load(img);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.textContent).toBe("E");
  });

  it("keeps the favicon img when the loaded resolution is good", () => {
    const { container } = render(
      <CompanyLogo name="EarlyCV" websiteUrl="https://earlycv.com.br" />,
    );

    const img = container.querySelector("img") as HTMLImageElement;
    Object.defineProperty(img, "naturalWidth", { value: 128, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 128, configurable: true });
    fireEvent.load(img);

    expect(container.querySelector("img")).toBeInTheDocument();
  });

  it("returns null src (no img) for a websiteUrl that fails URL parsing, falling back to the square", () => {
    const { container } = render(
      <CompanyLogo name="EarlyCV" websiteUrl="not-a-valid-url" />,
    );

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.textContent).toBe("E");
  });
});
