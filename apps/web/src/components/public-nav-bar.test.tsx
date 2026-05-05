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

  it("hides 'Como funciona' links when configured", () => {
    render(<PublicNavBar hideHowItWorksLink />);

    const button = screen.getAllByLabelText("Abrir menu", {
      selector: "button",
    })[0];
    fireEvent.click(button);

    expect(screen.queryByRole("link", { name: "Como funciona" })).toBeNull();
  });

  it("uses fixed header when configured", () => {
    const { container } = render(<PublicNavBar fixed />);
    const nav = container.querySelector("nav");

    expect(nav?.getAttribute("style")).toContain("position: fixed");
    expect(nav?.getAttribute("style")).toContain("top: 0px");
    expect(nav?.getAttribute("style")).toContain("left: 0px");
    expect(nav?.getAttribute("style")).toContain("right: 0px");
    expect(nav?.getAttribute("style")).toContain(
      "background: rgb(243, 242, 237)",
    );
    expect(nav?.getAttribute("style")).not.toContain(
      "border-bottom: 1px solid",
    );
  });
});
