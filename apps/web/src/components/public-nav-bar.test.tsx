import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { PublicNavBar } from "./public-nav-bar";

afterEach(() => {
  cleanup();
});

describe("PublicNavBar", () => {
  it("shows hamburger button on mobile layout", () => {
    render(<PublicNavBar />);

    expect(
      screen.getAllByLabelText("Abrir menu", { selector: "button" }).length,
    ).toBe(1);
  });

  it("opens and closes mobile menu", () => {
    render(<PublicNavBar />);

    const button = screen.getAllByLabelText("Abrir menu", {
      selector: "button",
    })[0];
    fireEvent.click(button);

    expect(screen.getAllByRole("link", { name: "Como funciona" }).length).toBe(
      2,
    );
    expect(
      screen.getAllByRole("link", { name: "Adaptar meu CV →" }).length,
    ).toBe(2);

    const blogLinks = screen.getAllByRole("link", { name: "Blog" });
    fireEvent.click(blogLinks[1]);
    expect(
      screen.getAllByLabelText("Abrir menu", { selector: "button" }).length,
    ).toBe(1);
  });
});
